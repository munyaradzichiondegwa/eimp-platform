import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { Payment, PaymentChannel, PaymentStatus, PaymentType } from '../finance/entities/payment.entity';
import { v4 as uuidv4 } from 'uuid';

export interface InitiatePaymentRequest {
  channel: PaymentChannel;
  amount: number;
  currency: string;
  phoneNumber: string;
  reference: string;         // Our internal reference
  description: string;
  customerId?: string;
  policyId?: string;
  invoiceId?: string;
  claimId?: string;
}

export interface PaymentResponse {
  success: boolean;
  gatewayRef?: string;
  status: PaymentStatus;
  message: string;
  redirectUrl?: string;
  pollUrl?: string;
  raw?: any;
}

// Circuit breaker state per provider
interface CircuitState {
  failures: number;
  lastFailure: Date | null;
  isOpen: boolean;
}

const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 60_000; // 1 minute

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);
  private circuits: Record<string, CircuitState> = {};

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
  ) {
    // Initialise circuit breakers for each provider
    for (const ch of Object.values(PaymentChannel)) {
      this.circuits[ch] = { failures: 0, lastFailure: null, isOpen: false };
    }
  }

  // ── PUBLIC: INITIATE PAYMENT ──────────────────────────────────────────────

  async initiatePayment(req: InitiatePaymentRequest): Promise<{ payment: Payment; gateway: PaymentResponse }> {
    this.checkCircuit(req.channel);

    const count = await this.paymentRepo.count();
    const paymentRef = `EBA-PAY-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
    const idempotencyKey = uuidv4();

    // Persist payment record immediately
    const payment = this.paymentRepo.create({
      paymentRef,
      paymentType: req.claimId ? PaymentType.CLAIM_SETTLEMENT : PaymentType.PREMIUM_COLLECTION,
      channel: req.channel,
      status: PaymentStatus.INITIATED,
      amount: req.amount,
      currency: req.currency,
      baseCurrencyAmount: req.amount,
      fxRate: 1,
      policyId: req.policyId,
      invoiceId: req.invoiceId,
      claimId: req.claimId,
      customerId: req.customerId,
      payerPhone: req.phoneNumber,
      metadata: { idempotencyKey, reference: req.reference },
    });
    const saved = await this.paymentRepo.save(payment);

    let gateway: PaymentResponse;
    try {
      gateway = await this.routeToProvider(req, paymentRef, idempotencyKey);

      if (gateway.success) {
        this.resetCircuit(req.channel);
        await this.paymentRepo.update(saved.id, {
          status: PaymentStatus.PENDING,
          gatewayRef: gateway.gatewayRef,
          gatewayRequest: { channel: req.channel, amount: req.amount, phone: req.phoneNumber } as any,
          gatewayResponse: gateway.raw as any,
        } as any);
      } else {
        this.recordFailure(req.channel);
        await this.paymentRepo.update(saved.id, {
          status: PaymentStatus.FAILED,
          failureReason: gateway.message,
        });
      }
    } catch (error) {
      this.recordFailure(req.channel);
      gateway = { success: false, status: PaymentStatus.QUEUED, message: error.message };
      await this.paymentRepo.update(saved.id, {
        status: PaymentStatus.QUEUED,
        failureReason: error.message,
        retryCount: 0,
        nextRetryAt: new Date(Date.now() + 30_000),
      });
      this.logger.warn(`Payment ${paymentRef} queued for retry: ${error.message}`);
    }

    return { payment: { ...saved, status: gateway.status } as Payment, gateway };
  }

  // ── PROVIDER ROUTING ─────────────────────────────────────────────────────

  private async routeToProvider(
    req: InitiatePaymentRequest,
    ref: string,
    idempotencyKey: string,
  ): Promise<PaymentResponse> {
    switch (req.channel) {
      case PaymentChannel.ECOCASH:
        return this.initiateEcoCash(req, ref, idempotencyKey);
      case PaymentChannel.ONEMONEY:
        return this.initiateOneMoney(req, ref, idempotencyKey);
      case PaymentChannel.INNBUCKS:
        return this.initiateInnBucks(req, ref, idempotencyKey);
      default:
        throw new BadRequestException(`Channel ${req.channel} not supported for automated initiation`);
    }
  }

  // ── ECOCASH ───────────────────────────────────────────────────────────────

  private async initiateEcoCash(
    req: InitiatePaymentRequest, ref: string, idempotencyKey: string,
  ): Promise<PaymentResponse> {
    const apiUrl = this.configService.get<string>('payments.ecocash.apiUrl');
    const merchantCode = this.configService.get<string>('payments.ecocash.merchantCode');
    const apiKey = this.configService.get<string>('payments.ecocash.apiKey');

    if (!apiUrl || !merchantCode) {
      // Dev/sandbox mode — simulate success
      this.logger.warn('EcoCash not configured — returning sandbox response');
      return {
        success: true,
        gatewayRef: `ECO-SANDBOX-${Date.now()}`,
        status: PaymentStatus.PENDING,
        message: 'Sandbox: EcoCash USSD push initiated. Awaiting customer approval.',
        raw: { sandbox: true },
      };
    }

    try {
      const response = await axios.post(
        `${apiUrl}/transactions/initiate`,
        {
          merchantCode,
          clientCorrelator: idempotencyKey,
          msisdn: req.phoneNumber.replace('+', ''),
          amount: req.amount.toFixed(2),
          currency: req.currency,
          paymentDescription: req.description,
          merchantPin: this.configService.get('payments.ecocash.apiSecret'),
          transactionOperationStatus: 'Charged',
          endUserId: `tel:${req.phoneNumber}`,
          referenceCode: ref,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': idempotencyKey,
          },
          timeout: 30_000,
        },
      );

      return {
        success: true,
        gatewayRef: response.data?.transactionReference || response.data?.serverReferenceCode,
        status: PaymentStatus.PENDING,
        message: 'EcoCash USSD push sent. Awaiting customer PIN entry.',
        pollUrl: response.data?.pollUrl,
        raw: response.data,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      throw new Error(`EcoCash error: ${msg}`);
    }
  }

  // ── ONEMONEY ─────────────────────────────────────────────────────────────

  private async initiateOneMoney(
    req: InitiatePaymentRequest, ref: string, idempotencyKey: string,
  ): Promise<PaymentResponse> {
    const apiUrl = this.configService.get<string>('payments.onemoney.apiUrl');
    const apiKey = this.configService.get<string>('payments.onemoney.apiKey');

    if (!apiUrl || !apiKey) {
      this.logger.warn('OneMoney not configured — returning sandbox response');
      return {
        success: true,
        gatewayRef: `ONE-SANDBOX-${Date.now()}`,
        status: PaymentStatus.PENDING,
        message: 'Sandbox: OneMoney push initiated.',
        raw: { sandbox: true },
      };
    }

    try {
      const response = await axios.post(
        `${apiUrl}/payment/request`,
        {
          phone: req.phoneNumber,
          amount: req.amount,
          currency: req.currency,
          reference: ref,
          description: req.description,
          merchantRef: this.configService.get('payments.onemoney.merchantNumber'),
        },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 30_000,
        },
      );

      return {
        success: true,
        gatewayRef: response.data?.transactionId,
        status: PaymentStatus.PENDING,
        message: 'OneMoney payment request sent.',
        raw: response.data,
      };
    } catch (error) {
      throw new Error(`OneMoney error: ${error.response?.data?.message || error.message}`);
    }
  }

  // ── INNBUCKS ─────────────────────────────────────────────────────────────

  private async initiateInnBucks(
    req: InitiatePaymentRequest, ref: string, idempotencyKey: string,
  ): Promise<PaymentResponse> {
    const apiUrl = this.configService.get<string>('payments.innbucks.apiUrl');
    const apiKey = this.configService.get<string>('payments.innbucks.apiKey');

    if (!apiUrl || !apiKey) {
      this.logger.warn('InnBucks not configured — returning sandbox response');
      return {
        success: true,
        gatewayRef: `INN-SANDBOX-${Date.now()}`,
        status: PaymentStatus.PENDING,
        message: 'Sandbox: InnBucks request initiated.',
        raw: { sandbox: true },
      };
    }

    try {
      const response = await axios.post(
        `${apiUrl}/collect`,
        {
          merchantId: this.configService.get('payments.innbucks.merchantId'),
          customerPhone: req.phoneNumber,
          amount: req.amount,
          currency: req.currency,
          externalRef: ref,
          narrative: req.description,
        },
        {
          headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
          timeout: 30_000,
        },
      );

      return {
        success: true,
        gatewayRef: response.data?.reference,
        status: PaymentStatus.PENDING,
        message: 'InnBucks collection initiated.',
        raw: response.data,
      };
    } catch (error) {
      throw new Error(`InnBucks error: ${error.response?.data?.message || error.message}`);
    }
  }

  // ── WEBHOOK HANDLER ──────────────────────────────────────────────────────

  async handleWebhook(channel: PaymentChannel, payload: any): Promise<{ paymentRef: string; status: PaymentStatus }> {
    this.logger.log(`Webhook received from ${channel}: ${JSON.stringify(payload).slice(0, 200)}`);

    // Extract gateway ref based on provider format
    let gatewayRef: string;
    let isSuccess: boolean;
    let failReason: string;

    switch (channel) {
      case PaymentChannel.ECOCASH:
        gatewayRef = payload.serverReferenceCode || payload.transactionReference;
        isSuccess = payload.transactionOperationStatus === 'Charged' || payload.status === 'SUCCESS';
        failReason = payload.description;
        break;
      case PaymentChannel.ONEMONEY:
        gatewayRef = payload.transactionId;
        isSuccess = payload.status === 'SUCCESS' || payload.status === 'COMPLETED';
        failReason = payload.failureReason;
        break;
      case PaymentChannel.INNBUCKS:
        gatewayRef = payload.reference || payload.externalRef;
        isSuccess = payload.status === 'SUCCESS';
        failReason = payload.message;
        break;
      default:
        throw new BadRequestException(`Unknown webhook channel: ${channel}`);
    }

    const payment = await this.paymentRepo.findOne({ where: { gatewayRef } });
    if (!payment) {
      this.logger.warn(`Webhook received for unknown gatewayRef: ${gatewayRef}`);
      return { paymentRef: 'unknown', status: PaymentStatus.FAILED };
    }

    const newStatus = isSuccess ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
    await this.paymentRepo.update(payment.id, {
      status: newStatus,
      confirmedAt: isSuccess ? new Date() : undefined,
      failureReason: !isSuccess ? failReason : undefined,
      gatewayResponse: payload,
    });

    return { paymentRef: payment.paymentRef, status: newStatus };
  }

  // ── CIRCUIT BREAKER ──────────────────────────────────────────────────────

  private checkCircuit(channel: PaymentChannel): void {
    const circuit = this.circuits[channel];
    if (!circuit) return;

    if (circuit.isOpen) {
      const elapsed = circuit.lastFailure
        ? Date.now() - circuit.lastFailure.getTime()
        : CIRCUIT_RESET_MS + 1;

      if (elapsed > CIRCUIT_RESET_MS) {
        circuit.isOpen = false;
        circuit.failures = 0;
        this.logger.log(`Circuit reset for ${channel}`);
      } else {
        const retryIn = Math.ceil((CIRCUIT_RESET_MS - elapsed) / 1000);
        throw new BadRequestException(
          `${channel} is temporarily unavailable. Retry in ${retryIn}s. Payment has been queued.`,
        );
      }
    }
  }

  private recordFailure(channel: PaymentChannel): void {
    const circuit = this.circuits[channel];
    if (!circuit) return;
    circuit.failures++;
    circuit.lastFailure = new Date();
    if (circuit.failures >= CIRCUIT_THRESHOLD) {
      circuit.isOpen = true;
      this.logger.warn(`Circuit OPEN for ${channel} after ${circuit.failures} failures`);
    }
  }

  private resetCircuit(channel: PaymentChannel): void {
    const circuit = this.circuits[channel];
    if (circuit) { circuit.failures = 0; circuit.isOpen = false; }
  }
}
