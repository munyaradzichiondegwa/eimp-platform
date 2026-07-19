import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import {
  IsString, IsEmail, IsEnum, IsOptional, IsBoolean, IsDateString,
} from 'class-validator';
import {
  Customer, CustomerType, CustomerStatus, CustomerSegment, KycStatus,
} from './entities/customer.entity';
import { KycDocument, KycDocumentType, KycDocumentStatus } from './entities/kyc-document.entity';
import {
  CommunicationLog, CommunicationChannel, CommunicationDirection, CommunicationPurpose,
} from './entities/communication-log.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';

export class CreateCustomerDto {
  @IsEnum(CustomerType) type: CustomerType;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() idNumber?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() registrationNumber?: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() whatsappNumber?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsEnum(CustomerSegment) segment?: CustomerSegment;
  @IsOptional() @IsString() brokerId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateCustomerDto extends CreateCustomerDto {}

export class LogCommunicationDto {
  @IsEnum(CommunicationChannel) channel: CommunicationChannel;
  @IsEnum(CommunicationDirection) direction: CommunicationDirection;
  @IsEnum(CommunicationPurpose) purpose: CommunicationPurpose;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() recipient?: string;
  @IsOptional() @IsString() policyId?: string;
  @IsOptional() @IsString() claimId?: string;
}

let customerSeq = 1;

function generateCustomerNumber(): string {
  return `EBA-C-${String(customerSeq++).padStart(6, '0')}`;
}

@Injectable()
export class CrmService {
  constructor(
    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
    @InjectRepository(KycDocument)
    private kycRepo: Repository<KycDocument>,
    @InjectRepository(CommunicationLog)
    private commRepo: Repository<CommunicationLog>,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateCustomerDto, createdById: string): Promise<Customer> {
    // Validate required fields by type
    if (dto.type === CustomerType.INDIVIDUAL && !dto.firstName) {
      throw new BadRequestException('firstName is required for individual customers');
    }
    if (dto.type === CustomerType.CORPORATE && !dto.companyName) {
      throw new BadRequestException('companyName is required for corporate customers');
    }

    // Check for duplicate email
    const existingEmail = await this.customerRepo.findOne({ where: { email: dto.email.toLowerCase() } });
    if (existingEmail) {
      throw new ConflictException(`A customer with email ${dto.email} already exists`);
    }

    // Check for duplicate ID number (individuals)
    if (dto.idNumber) {
      const existingId = await this.customerRepo.findOne({ where: { idNumber: dto.idNumber } });
      if (existingId) {
        throw new ConflictException(`A customer with ID number ${dto.idNumber} already exists`);
      }
    }

    // Get next sequence number from DB
    const count = await this.customerRepo.count();
    const customerNumber = `EBA-C-${String(count + 1).padStart(6, '0')}`;

    const customer = this.customerRepo.create({
      ...dto,
      email: dto.email.toLowerCase(),
      customerNumber,
      kycStatus: KycStatus.NOT_SUBMITTED,
      status: CustomerStatus.ACTIVE,
      createdById,
    });

    const saved = await this.customerRepo.save(customer);

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'customer',
      entityId: saved.id,
      entityRef: saved.customerNumber,
      userId: createdById,
      description: `Created customer ${saved.customerNumber} — ${saved.fullName}`,
      module: 'crm',
    });

    return saved;
  }

  async findAll(options: {
    search?: string;
    type?: CustomerType;
    status?: CustomerStatus;
    kycStatus?: KycStatus;
    segment?: CustomerSegment;
    page?: number;
    limit?: number;
  }): Promise<{ data: Customer[]; total: number }> {
    const { page = 1, limit = 20, search, type, status, kycStatus, segment } = options;

    const qb = this.customerRepo.createQueryBuilder('c');

    if (search) {
      qb.andWhere(
        '(c.firstName ILIKE :s OR c.lastName ILIKE :s OR c.email ILIKE :s OR c.customerNumber ILIKE :s OR c.idNumber ILIKE :s OR c.companyName ILIKE :s OR c.phone ILIKE :s)',
        { s: `%${search}%` },
      );
    }
    if (type) qb.andWhere('c.type = :type', { type });
    if (status) qb.andWhere('c.status = :status', { status });
    if (kycStatus) qb.andWhere('c.kycStatus = :kycStatus', { kycStatus });
    if (segment) qb.andWhere('c.segment = :segment', { segment });

    qb.orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findById(id: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  async findByNumber(customerNumber: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { customerNumber } });
    if (!customer) throw new NotFoundException(`Customer ${customerNumber} not found`);
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, updatedById: string): Promise<Customer> {
    const customer = await this.findById(id);
    const before = { ...customer };
    Object.assign(customer, dto);
    const updated = await this.customerRepo.save(customer);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'customer',
      entityId: id,
      entityRef: customer.customerNumber,
      userId: updatedById,
      before,
      after: updated,
      module: 'crm',
    });

    return updated;
  }

  async updateKycStatus(
    customerId: string,
    status: KycStatus,
    reviewedById: string,
    notes?: string,
  ): Promise<Customer> {
    const customer = await this.findById(customerId);
    const oldStatus = customer.kycStatus;
    customer.kycStatus = status;

    if (status === KycStatus.APPROVED) {
      customer.kycApprovedAt = new Date();
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 2);
      customer.kycExpiryDate = expiry;
    }

    await this.customerRepo.save(customer);

    await this.auditService.log({
      action: AuditAction.APPROVE,
      entityType: 'customer',
      entityId: customerId,
      entityRef: customer.customerNumber,
      userId: reviewedById,
      description: `KYC status: ${oldStatus} → ${status}${notes ? ': ' + notes : ''}`,
      module: 'crm',
    });

    return customer;
  }

  // KYC Documents
  async addKycDocument(
    customerId: string,
    data: {
      documentType: KycDocumentType;
      documentNumber?: string;
      fileKey: string;
      fileExtension: string;
      fileSizeBytes?: number;
      expiryDate?: Date;
    },
    uploadedById: string,
  ): Promise<KycDocument> {
    await this.findById(customerId);

    const doc = this.kycRepo.create({
      customerId,
      ...data,
      status: KycDocumentStatus.PENDING,
    });

    const saved = await this.kycRepo.save(doc);

    // Move KYC status to pending review
    await this.customerRepo.update(customerId, { kycStatus: KycStatus.PENDING_REVIEW });

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'kyc_document',
      entityId: saved.id,
      userId: uploadedById,
      description: `KYC document uploaded: ${data.documentType} for customer ${customerId}`,
      module: 'crm',
    });

    return saved;
  }

  async getKycDocuments(customerId: string): Promise<KycDocument[]> {
    return this.kycRepo.find({
      where: { customerId },
      order: { uploadedAt: 'DESC' },
    });
  }

  async reviewKycDocument(
    docId: string,
    status: KycDocumentStatus,
    reviewedById: string,
    rejectionReason?: string,
  ): Promise<KycDocument> {
    const doc = await this.kycRepo.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException('KYC document not found');

    doc.status = status;
    doc.reviewedAt = new Date();
    doc.reviewedById = reviewedById;
    if (rejectionReason) doc.rejectionReason = rejectionReason;

    return this.kycRepo.save(doc);
  }

  // Communication logs
  async logCommunication(
    customerId: string,
    dto: LogCommunicationDto,
    sentById: string,
  ): Promise<CommunicationLog> {
    await this.findById(customerId);

    const log = this.commRepo.create({
      customerId,
      ...dto,
      sentById,
    });

    return this.commRepo.save(log);
  }

  async getCommunicationHistory(customerId: string): Promise<CommunicationLog[]> {
    return this.commRepo.find({
      where: { customerId },
      order: { sentAt: 'DESC' },
      take: 100,
    });
  }

  // Dashboard stats
  async getStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    byKycStatus: Record<string, number>;
    byStatus: Record<string, number>;
    newThisMonth: number;
  }> {
    const total = await this.customerRepo.count();

    const byType: Record<string, number> = {};
    for (const t of Object.values(CustomerType)) {
      byType[t] = await this.customerRepo.count({ where: { type: t } });
    }

    const byKycStatus: Record<string, number> = {};
    for (const k of Object.values(KycStatus)) {
      byKycStatus[k] = await this.customerRepo.count({ where: { kycStatus: k } });
    }

    const byStatus: Record<string, number> = {};
    for (const s of Object.values(CustomerStatus)) {
      byStatus[s] = await this.customerRepo.count({ where: { status: s } });
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const newThisMonth = await this.customerRepo
      .createQueryBuilder('c')
      .where('c.createdAt >= :start', { start: startOfMonth })
      .getCount();

    return { total, byType, byKycStatus, byStatus, newThisMonth };
  }
}
