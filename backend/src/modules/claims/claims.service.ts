import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsEnum, IsOptional, IsNumber, IsDateString, IsUUID } from 'class-validator';
import { Claim, ClaimStatus, ClaimType, ClaimChannel } from './entities/claim.entity';
import { ClaimDocument, ClaimDocumentType } from './entities/claim-document.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { FraudDetectionService } from '../ai/fraud-detection.service';

export class CreateClaimDto {
  @IsUUID() policyId: string;
  @IsUUID() customerId: string;
  @IsEnum(ClaimType) claimType: ClaimType;
  @IsEnum(ClaimChannel) channel: ClaimChannel;
  @IsDateString() eventDate: string;
  @IsOptional() @IsString() eventDescription?: string;
  @IsOptional() @IsString() eventLocation?: string;
  @IsOptional() @IsNumber() claimedAmount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() thirdPartyDetails?: Record<string, any>;
  @IsOptional() serviceProviderDetails?: Record<string, any>;
}

export class UpdateClaimStatusDto {
  @IsEnum(ClaimStatus) status: ClaimStatus;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() approvedAmount?: number;
  @IsOptional() @IsNumber() reserveAmount?: number;
  @IsOptional() @IsString() rejectionReason?: string;
}

export class SettleClaimDto {
  @IsNumber() settlementAmount: number;
  @IsString() paymentChannel: string;
  @IsString() accountNumber: string;
  @IsOptional() @IsString() notes?: string;
}

// Fraud detection rules
@Injectable()
export class ClaimsService {
  constructor(
    @InjectRepository(Claim)
    private claimRepo: Repository<Claim>,
    @InjectRepository(ClaimDocument)
    private docRepo: Repository<ClaimDocument>,
    private auditService: AuditService,
    private fraudDetectionService: FraudDetectionService,
  ) {}

  async submitFnol(dto: CreateClaimDto, submittedById: string): Promise<Claim> {
    const count = await this.claimRepo.count();
    const year = new Date().getFullYear();
    const claimNumber = `EBA-CLM-${year}-${String(count + 1).padStart(6, '0')}`;

    const slaTarget = new Date();
    slaTarget.setDate(slaTarget.getDate() + 5); // 5 working days target

    const claim = this.claimRepo.create({
      claimNumber,
      policyId: dto.policyId,
      customerId: dto.customerId,
      claimType: dto.claimType,
      channel: dto.channel,
      eventDate: new Date(dto.eventDate),
      eventDescription: dto.eventDescription,
      eventLocation: dto.eventLocation,
      claimedAmount: dto.claimedAmount,
      currency: dto.currency || 'USD',
      thirdPartyDetails: dto.thirdPartyDetails,
      serviceProviderDetails: dto.serviceProviderDetails,
      status: ClaimStatus.FNOL_SUBMITTED,
      submittedById,
      slaTargetDate: slaTarget,
      acknowledgedAt: new Date(),
      statusHistory: [{
        status: ClaimStatus.FNOL_SUBMITTED,
        changedAt: new Date().toISOString(),
        changedById: submittedById,
        notes: 'FNOL submitted',
      }],
    });

    const saved = await this.claimRepo.save(claim);

    // Run fraud detection asynchronously
    await this.runFraudDetection(saved.id);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'claim',
      entityId: saved.id, entityRef: saved.claimNumber,
      userId: submittedById, description: `FNOL submitted: ${saved.claimNumber}`, module: 'claims',
    });

    return saved;
  }

  async registerClaim(claimId: string, assignedToId: string, userId: string): Promise<Claim> {
    const claim = await this.findById(claimId);
    if (claim.status !== ClaimStatus.FNOL_SUBMITTED) {
      throw new BadRequestException('Claim must be in FNOL_SUBMITTED status to register');
    }
    return this.transitionStatus(claim, ClaimStatus.REGISTERED, userId, 'Claim registered and assigned', { assignedToId });
  }

  async updateStatus(
    claimId: string,
    dto: UpdateClaimStatusDto,
    userId: string,
  ): Promise<Claim> {
    const claim = await this.findById(claimId);
    const updates: Partial<Claim> = {};

    if (dto.reserveAmount !== undefined) {
      updates.reserveAmount = dto.reserveAmount;
    }
    if (dto.approvedAmount !== undefined) {
      updates.approvedAmount = dto.approvedAmount;
    }
    if (dto.rejectionReason) {
      updates.rejectionReason = dto.rejectionReason;
    }
    if (dto.status === ClaimStatus.UNDER_ASSESSMENT) {
      updates.assessedById = userId;
      updates.assessmentDate = new Date();
      updates.assessmentNotes = dto.notes;
    }
    if (dto.status === ClaimStatus.APPROVED || dto.status === ClaimStatus.PARTIALLY_APPROVED) {
      updates.approvedById = userId;
      updates.approvalDate = new Date();
    }

    return this.transitionStatus(claim, dto.status, userId, dto.notes, updates);
  }

  async settleClaim(claimId: string, dto: SettleClaimDto, userId: string): Promise<Claim> {
    const claim = await this.findById(claimId);
    if (![ClaimStatus.APPROVED, ClaimStatus.PARTIALLY_APPROVED].includes(claim.status)) {
      throw new BadRequestException('Claim must be approved before settlement');
    }

    const updates: Partial<Claim> = {
      settlementAmount: dto.settlementAmount,
      settlementPaymentChannel: dto.paymentChannel,
      settlementAccountNumber: dto.accountNumber,
      settlementDate: new Date(),
    };

    const settled = await this.transitionStatus(
      claim, ClaimStatus.SETTLEMENT_PROCESSING, userId,
      `Settlement initiated: ${dto.notes || ''}`, updates,
    );

    await this.auditService.log({
      action: AuditAction.APPROVE, entityType: 'claim',
      entityId: claimId, entityRef: claim.claimNumber,
      userId, description: `Claim settlement initiated: USD ${dto.settlementAmount}`, module: 'claims',
    });

    return settled;
  }

  async confirmSettlement(claimId: string, paymentRef: string, userId: string): Promise<Claim> {
    const claim = await this.findById(claimId);
    const updates: Partial<Claim> = {
      settlementPaymentRef: paymentRef,
      settlementGlPosted: true,
    };
    return this.transitionStatus(claim, ClaimStatus.SETTLED, userId, 'Payment confirmed', updates);
  }

  async addDocument(
    claimId: string,
    data: {
      documentType: ClaimDocumentType;
      originalFilename?: string;
      fileKey: string;
      fileExtension?: string;
      fileSizeBytes?: number;
      notes?: string;
    },
    uploadedById: string,
  ): Promise<ClaimDocument> {
    await this.findById(claimId);
    const doc = this.docRepo.create({ claimId, ...data, uploadedById });
    return this.docRepo.save(doc);
  }

  async getDocuments(claimId: string): Promise<ClaimDocument[]> {
    return this.docRepo.find({ where: { claimId }, order: { uploadedAt: 'DESC' } });
  }

  async findAll(options: {
    status?: ClaimStatus;
    customerId?: string;
    policyId?: string;
    fraudFlagged?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Claim[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const qb = this.claimRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.policy', 'policy')
      .leftJoinAndSelect('c.customer', 'customer');

    if (options.status) qb.andWhere('c.status = :s', { s: options.status });
    if (options.customerId) qb.andWhere('c.customerId = :cid', { cid: options.customerId });
    if (options.policyId) qb.andWhere('c.policyId = :pid', { pid: options.policyId });
    if (options.fraudFlagged !== undefined) {
      qb.andWhere('c.fraudFlagged = :f', { f: options.fraudFlagged });
    }
    if (options.search) {
      qb.andWhere('(c.claimNumber ILIKE :s OR customer.email ILIKE :s OR policy.policyNumber ILIKE :s)',
        { s: `%${options.search}%` });
    }

    qb.orderBy('c.fnolDate', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findById(id: string): Promise<Claim> {
    const claim = await this.claimRepo.findOne({
      where: { id },
      relations: ['policy', 'customer'],
    });
    if (!claim) throw new NotFoundException(`Claim ${id} not found`);
    return claim;
  }

  async getStats(): Promise<{
    total: number;
    open: number;
    settled: number;
    fraudFlagged: number;
    totalReserved: number;
    totalSettled: number;
    avgSettlementDays: number;
    byStatus: Record<string, number>;
  }> {
    const total = await this.claimRepo.count();
    const open = await this.claimRepo
      .createQueryBuilder('c')
      .where("c.status NOT IN ('settled', 'closed', 'rejected', 'withdrawn')")
      .getCount();
    const settled = await this.claimRepo.count({ where: { status: ClaimStatus.SETTLED } });
    const fraudFlagged = await this.claimRepo.count({ where: { fraudFlagged: true } });

    const reserveResult = await this.claimRepo
      .createQueryBuilder('c')
      .select('SUM(c.reserveAmount)', 'total')
      .where("c.status NOT IN ('settled', 'closed', 'rejected')")
      .getRawOne();
    const totalReserved = parseFloat(reserveResult?.total || '0');

    const settledResult = await this.claimRepo
      .createQueryBuilder('c')
      .select('SUM(c.settlementAmount)', 'total')
      .where("c.status = 'settled'")
      .getRawOne();
    const totalSettled = parseFloat(settledResult?.total || '0');

    // Average settlement days
    const avgResult = await this.claimRepo
      .createQueryBuilder('c')
      .select('AVG(EXTRACT(EPOCH FROM (c.settlementDate - c.fnolDate)) / 86400)', 'avg_days')
      .where("c.status = 'settled' AND c.settlementDate IS NOT NULL")
      .getRawOne();
    const avgSettlementDays = parseFloat(avgResult?.avg_days || '0');

    const byStatus: Record<string, number> = {};
    for (const s of Object.values(ClaimStatus)) {
      byStatus[s] = await this.claimRepo.count({ where: { status: s } });
    }

    return { total, open, settled, fraudFlagged, totalReserved, totalSettled, avgSettlementDays, byStatus };
  }

  private async runFraudDetection(claimId: string): Promise<void> {
    const claim = await this.claimRepo.findOne({
      where: { id: claimId },
      relations: ['policy'],
    });
    if (!claim) return;

    const result = await this.fraudDetectionService.scoreClaim(claim);

    await this.claimRepo.update(claimId, {
      fraudScore: result.score,
      fraudFlagged: result.flagged,
      fraudFlags: JSON.stringify(result.flags.map(f => f.rule)),
      duplicateDetected: result.flags.some(f => f.rule === 'claim_velocity'),
    });

    if (result.recommendation === 'investigate') {
      await this.auditService.log({
        action: AuditAction.UPDATE, entityType: 'claim',
        entityId: claimId, entityRef: claim.claimNumber,
        userId: 'system', module: 'claims',
        description: `Fraud detection flagged for investigation: score ${result.score}/100 — ${result.flags.map(f => f.rule).join(', ')}`,
      });
    }
  }

  private async transitionStatus(
    claim: Claim,
    newStatus: ClaimStatus,
    userId: string,
    notes?: string,
    extraUpdates?: Partial<Claim>,
  ): Promise<Claim> {
    const oldStatus = claim.status;
    const history = claim.statusHistory || [];
    history.push({
      status: newStatus,
      changedAt: new Date().toISOString(),
      changedById: userId,
      notes,
    });

    Object.assign(claim, extraUpdates, { status: newStatus, statusHistory: history });
    const saved = await this.claimRepo.save(claim);

    await this.auditService.log({
      action: AuditAction.UPDATE, entityType: 'claim',
      entityId: claim.id, entityRef: claim.claimNumber,
      userId, description: `Claim ${claim.claimNumber}: ${oldStatus} → ${newStatus}${notes ? ': ' + notes : ''}`,
      module: 'claims',
    });

    return saved;
  }
}
