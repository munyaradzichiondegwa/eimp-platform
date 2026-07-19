import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, Between } from 'typeorm';
import { Policy, PolicyStatus } from '../underwriting/entities/policy.entity';
import { Customer, KycStatus } from '../crm/entities/customer.entity';
import { Payment, PaymentStatus } from '../finance/entities/payment.entity';
import { Invoice, InvoiceStatus } from '../finance/entities/invoice.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);

  constructor(
    @InjectRepository(Policy) private policyRepo: Repository<Policy>,
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    private readonly notifications: NotificationsService,
  ) {}

  // ── RENEWAL REMINDERS: daily at 08:00 CAT ────────────────────────────────

  @Cron('0 8 * * *', { timeZone: 'Africa/Harare' })
  async sendRenewalReminders(): Promise<void> {
    this.logger.log('Running renewal reminder job...');
    const reminderDays = [60, 30, 7];

    for (const days of reminderDays) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);

      const policies = await this.policyRepo.find({
        where: { status: PolicyStatus.ACTIVE, endDate: Between(dayStart as any, dayEnd as any) },
        relations: ['customer'],
      });

      for (const policy of policies) {
        if (!policy.customer) continue;
        try {
          await this.notifications.sendRenewalReminder(
            policy.customer.email,
            policy.customer.phone,
            {
              customerName: policy.customer.fullName,
              policyNumber: policy.policyNumber,
              expiryDate: policy.endDate.toLocaleDateString('en-ZW'),
              daysLeft: days,
              premium: Number(policy.grossPremium),
              currency: policy.currency,
            },
          );
          this.logger.log(`Renewal reminder sent: ${policy.policyNumber} (${days} days)`);
        } catch (e) {
          this.logger.error(`Renewal reminder failed for ${policy.policyNumber}: ${e.message}`);
        }
      }
    }
  }

  // ── KYC EXPIRY ALERTS: daily at 09:00 CAT ────────────────────────────────

  @Cron('0 9 * * *', { timeZone: 'Africa/Harare' })
  async kycExpiryAlerts(): Promise<void> {
    this.logger.log('Running KYC expiry check...');
    const alertDays = [30, 14, 7];

    for (const days of alertDays) {
      const target = new Date();
      target.setDate(target.getDate() + days);
      const dayStart = new Date(target); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(target); dayEnd.setHours(23, 59, 59, 999);

      const customers = await this.customerRepo
        .createQueryBuilder('c')
        .where("c.kycStatus = 'approved'")
        .andWhere('c.kycExpiryDate BETWEEN :start AND :end', { start: dayStart, end: dayEnd })
        .getMany();

      for (const customer of customers) {
        try {
          await this.notifications.sendEmail({
            to: customer.email,
            subject: 'Action Required: Your KYC documents expire soon',
            html: `<p>Dear ${customer.fullName}, your KYC documents expire in ${days} days. Please log in to update them.</p>`,
          });
          // Mark as re-verification required
          if (days === 7) {
            await this.customerRepo.update(customer.id, { kycStatus: KycStatus.RE_VERIFICATION_REQUIRED });
          }
        } catch (e) {
          this.logger.error(`KYC expiry alert failed for ${customer.customerNumber}: ${e.message}`);
        }
      }
    }
  }

  // ── LAPSE PROCESSING: daily at 01:00 CAT ─────────────────────────────────

  @Cron('0 1 * * *', { timeZone: 'Africa/Harare' })
  async processLapsedPolicies(): Promise<void> {
    this.logger.log('Running lapse processing...');
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Mark overdue pending-payment policies as lapsed (grace period: 14 days)
    const graceDate = new Date(); graceDate.setDate(graceDate.getDate() - 14);

    const result = await this.policyRepo
      .createQueryBuilder()
      .update(Policy)
      .set({ status: PolicyStatus.LAPSED })
      .where("status = 'pending_payment'")
      .andWhere('nextPaymentDueDate <= :grace', { grace: graceDate })
      .execute();

    if (result.affected) this.logger.log(`Lapsed ${result.affected} policies`);

    // Mark expired active policies
    const expired = await this.policyRepo
      .createQueryBuilder()
      .update(Policy)
      .set({ status: PolicyStatus.EXPIRED })
      .where("status = 'active'")
      .andWhere('endDate < :today', { today })
      .execute();

    if (expired.affected) this.logger.log(`Expired ${expired.affected} policies`);
  }

  // ── OVERDUE INVOICE MARKING: daily at 02:00 CAT ───────────────────────────

  @Cron('0 2 * * *', { timeZone: 'Africa/Harare' })
  async markOverdueInvoices(): Promise<void> {
    const today = new Date();
    const result = await this.invoiceRepo
      .createQueryBuilder()
      .update(Invoice)
      .set({ status: InvoiceStatus.OVERDUE })
      .where("status IN ('issued','partially_paid')")
      .andWhere('dueDate < :today', { today })
      .execute();

    if (result.affected) this.logger.log(`Marked ${result.affected} invoices as overdue`);
  }

  // ── PAYMENT RETRY: every 5 minutes ───────────────────────────────────────

  @Cron('*/5 * * * *')
  async retryQueuedPayments(): Promise<void> {
    const now = new Date();
    const queued = await this.paymentRepo
      .createQueryBuilder('p')
      .where("p.status = 'queued'")
      .andWhere('p.nextRetryAt <= :now', { now })
      .andWhere('p.retryCount < 5')
      .take(10)
      .getMany();

    for (const payment of queued) {
      this.logger.log(`Retry attempt ${(payment.retryCount || 0) + 1} for payment ${payment.paymentRef}`);
      // In production, re-queue through the gateway service
      // Exponential backoff: 30s, 1m, 5m, 15m, 30m
      const backoffMs = [30_000, 60_000, 300_000, 900_000, 1_800_000];
      const nextRetry = new Date(Date.now() + (backoffMs[payment.retryCount] || 1_800_000));
      await this.paymentRepo.update(payment.id, {
        retryCount: (payment.retryCount || 0) + 1,
        nextRetryAt: nextRetry,
        status: payment.retryCount >= 4 ? PaymentStatus.FAILED : PaymentStatus.QUEUED,
        failureReason: payment.retryCount >= 4 ? 'Max retries exceeded' : payment.failureReason,
      });
    }
  }
}
