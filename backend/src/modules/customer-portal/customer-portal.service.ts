import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer, CustomerStatus } from '../crm/entities/customer.entity';
import { KycDocumentType } from '../crm/entities/kyc-document.entity';
import { CrmService } from '../crm/crm.service';
import { LeadTicketService } from '../crm/lead-ticket.service';
import { TicketPriority, TicketCategory } from '../crm/entities/support-ticket.entity';
import {
  UnderwritingService, QuotationDto, IssuePolicyDto,
} from '../underwriting/underwriting.service';
import { DocumentGenerationService } from '../underwriting/document-generation.service';
import { DistributionChannel } from '../underwriting/entities/policy.entity';
import { ClaimsService, CreateClaimDto } from '../claims/claims.service';
import { ClaimChannel } from '../claims/entities/claim.entity';
import { FinanceService } from '../finance/finance.service';
import { PaymentGatewayService, InitiatePaymentRequest } from '../finance/payment-gateway.service';
import { ChatbotService } from '../ai/chatbot.service';

/**
 * Every method below resolves the caller's own Customer record from their
 * platform userId and uses that customerId for every downstream query or
 * write - the customerId is never accepted as a parameter from the request
 * body. This is the actual access-control boundary for the self-service
 * portal: a customer can authenticate and call any of these endpoints, but
 * can structurally only ever see or modify their own records.
 */
@Injectable()
export class CustomerPortalService {
  constructor(
    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
    private crmService: CrmService,
    private leadTicketService: LeadTicketService,
    private underwritingService: UnderwritingService,
    private documentGenerationService: DocumentGenerationService,
    private claimsService: ClaimsService,
    private financeService: FinanceService,
    private paymentGatewayService: PaymentGatewayService,
    private chatbotService: ChatbotService,
  ) {}

  async resolveCustomer(userId: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { userId } });
    if (!customer) {
      throw new NotFoundException('No customer profile linked to this account. Please contact support.');
    }
    return customer;
  }

  async getMyProfile(userId: string): Promise<Customer> {
    return this.resolveCustomer(userId);
  }

  async updateMyProfile(userId: string, dto: Partial<{
    phone: string; addressLine1: string; addressLine2: string; city: string;
    province: string; whatsappNumber: string; preferredLanguage: string;
    emailNotifications: boolean; smsNotifications: boolean; whatsappNotifications: boolean;
    firstName: string; lastName: string;
  }>): Promise<Customer> {
    const customer = await this.resolveCustomer(userId);

    const nameChanging = (dto.firstName && dto.firstName !== customer.firstName)
      || (dto.lastName && dto.lastName !== customer.lastName);

    const updated = await this.crmService.update(customer.id, dto as any, userId);

    if (nameChanging) {
      await this.crmService.updateKycStatus(
        customer.id, 're_verification_required' as any, userId,
        'Name change requires re-verification of identity documents',
      );
    }

    return updated;
  }

  async uploadMyKycDocument(userId: string, data: {
    documentType: KycDocumentType;
    documentNumber?: string;
    fileKey: string;
    fileExtension: string;
    fileSizeBytes?: number;
  }) {
    const customer = await this.resolveCustomer(userId);
    return this.crmService.addKycDocument(customer.id, data, userId);
  }

  async getMyKycDocuments(userId: string) {
    const customer = await this.resolveCustomer(userId);
    return this.crmService.getKycDocuments(customer.id);
  }

  async getQuote(userId: string, dto: Omit<QuotationDto, 'customerId' | 'distributionChannel'>) {
    const customer = await this.resolveCustomer(userId);
    return this.underwritingService.generateQuote({
      ...dto,
      customerId: customer.id,
      distributionChannel: DistributionChannel.CUSTOMER_PORTAL,
    } as QuotationDto);
  }

  async purchasePolicy(userId: string, dto: Omit<IssuePolicyDto, 'customerId' | 'distributionChannel'>) {
    const customer = await this.resolveCustomer(userId);
    if (customer.kycStatus !== 'approved') {
      throw new ForbiddenException('Your KYC verification must be approved before purchasing a policy. Please complete identity verification first.');
    }
    const policy = await this.underwritingService.issuePolicy({
      ...dto,
      customerId: customer.id,
      distributionChannel: DistributionChannel.CUSTOMER_PORTAL,
    } as IssuePolicyDto, userId);

    return policy;
  }

  async getMyPolicies(userId: string) {
    const customer = await this.resolveCustomer(userId);
    return this.underwritingService.findPolicies({ customerId: customer.id, limit: 100 });
  }

  async getMyPolicy(userId: string, policyId: string) {
    const customer = await this.resolveCustomer(userId);
    const policy = await this.underwritingService.findPolicyById(policyId);
    if (policy.customerId !== customer.id) {
      throw new ForbiddenException('This policy does not belong to your account');
    }
    return policy;
  }

  async downloadMyPolicySchedule(userId: string, policyId: string): Promise<Buffer> {
    const customer = await this.resolveCustomer(userId);
    const policy = await this.underwritingService.findPolicyById(policyId);
    if (policy.customerId !== customer.id) {
      throw new ForbiddenException('This policy does not belong to your account');
    }
    if (!policy.product) throw new NotFoundException('Policy product details unavailable');
    return this.documentGenerationService.generatePolicySchedule(policy, customer, policy.product);
  }

  async downloadMyCertificate(userId: string, policyId: string): Promise<Buffer> {
    const customer = await this.resolveCustomer(userId);
    const policy = await this.underwritingService.findPolicyById(policyId);
    if (policy.customerId !== customer.id) {
      throw new ForbiddenException('This policy does not belong to your account');
    }
    if (!policy.product) throw new NotFoundException('Policy product details unavailable');
    return this.documentGenerationService.generateCertificate(policy, customer, policy.product);
  }

  async submitMyClaim(userId: string, dto: Omit<CreateClaimDto, 'customerId' | 'channel'>) {
    const customer = await this.resolveCustomer(userId);

    const policy = await this.underwritingService.findPolicyById(dto.policyId);
    if (policy.customerId !== customer.id) {
      throw new ForbiddenException('This policy does not belong to your account');
    }

    return this.claimsService.submitFnol({
      ...dto,
      customerId: customer.id,
      channel: ClaimChannel.WEB_PORTAL,
    } as CreateClaimDto, userId);
  }

  async getMyClaims(userId: string) {
    const customer = await this.resolveCustomer(userId);
    return this.claimsService.findAll({ customerId: customer.id, limit: 100 });
  }

  async getMyClaim(userId: string, claimId: string) {
    const customer = await this.resolveCustomer(userId);
    const claim = await this.claimsService.findById(claimId);
    if (claim.customerId !== customer.id) {
      throw new ForbiddenException('This claim does not belong to your account');
    }
    return claim;
  }

  async addMyClaimDocument(userId: string, claimId: string, data: any) {
    const customer = await this.resolveCustomer(userId);
    const claim = await this.claimsService.findById(claimId);
    if (claim.customerId !== customer.id) {
      throw new ForbiddenException('This claim does not belong to your account');
    }
    return this.claimsService.addDocument(claimId, data, userId);
  }

  async getMyInvoices(userId: string) {
    const customer = await this.resolveCustomer(userId);
    return this.financeService.findInvoices({ customerId: customer.id, limit: 100 });
  }

  async initiateMyPayment(userId: string, dto: Omit<InitiatePaymentRequest, 'customerId'>) {
    const customer = await this.resolveCustomer(userId);

    if (dto.policyId) {
      const policy = await this.underwritingService.findPolicyById(dto.policyId);
      if (policy.customerId !== customer.id) {
        throw new ForbiddenException('This policy does not belong to your account');
      }
    }

    return this.paymentGatewayService.initiatePayment({ ...dto, customerId: customer.id });
  }

  async createMySupportTicket(userId: string, dto: {
    subject: string; description: string; category?: TicketCategory;
    policyId?: string; claimId?: string;
  }) {
    const customer = await this.resolveCustomer(userId);
    return this.leadTicketService.createTicket({
      customerId: customer.id,
      subject: dto.subject,
      description: dto.description,
      category: dto.category,
      priority: TicketPriority.MEDIUM,
      policyId: dto.policyId,
      claimId: dto.claimId,
    }, userId);
  }

  async getMySupportTickets(userId: string) {
    const customer = await this.resolveCustomer(userId);
    return this.leadTicketService.findTickets({ customerId: customer.id, limit: 50 });
  }

  async startChat(userId: string) {
    const customer = await this.resolveCustomer(userId);
    return this.chatbotService.startOrGetSession(customer.id, userId);
  }

  async sendChatMessage(userId: string, sessionId: string, message: string) {
    const customer = await this.resolveCustomer(userId);
    return this.chatbotService.sendMessage(sessionId, customer.id, message);
  }

  async getChatHistory(userId: string) {
    const customer = await this.resolveCustomer(userId);
    return this.chatbotService.getHistory(customer.id);
  }
}
