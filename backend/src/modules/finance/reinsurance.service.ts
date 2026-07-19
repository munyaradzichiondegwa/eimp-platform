import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ReinsuranceTreaty, TreatyType, TreatyStatus,
} from './entities/reinsurance-treaty.entity';
import { ReinsuranceCession } from './entities/reinsurance-cession.entity';
import {
  ReinsuranceRecovery, RecoveryStatus,
} from './entities/reinsurance-recovery.entity';
import {
  ReinsuranceBordereau, BordereauStatus,
} from './entities/reinsurance-bordereau.entity';
import { FinanceService } from './finance.service';
import { GlEntrySource } from './entities/gl-entry.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';

export interface CreateTreatyDto {
  name: string;
  reinsurerName: string;
  reinsurerContact?: string;
  type: TreatyType;
  effectiveDate: string;
  expiryDate: string;
  cessionPercentage?: number;
  retentionLimit?: number;
  maxCessionLimit?: number;
  cedingCommissionRate?: number;
  flatAnnualPremium?: number;
  applicableProductTypes?: string[];
  terms?: string;
}

export interface CedePolicyInput {
  policyId: string;
  policyNumber: string;
  sumInsured: number;
  grossPremium: number;
}

@Injectable()
export class ReinsuranceService {
  private readonly logger = new Logger(ReinsuranceService.name);

  constructor(
    @InjectRepository(ReinsuranceTreaty)
    private treatyRepo: Repository<ReinsuranceTreaty>,
    @InjectRepository(ReinsuranceCession)
    private cessionRepo: Repository<ReinsuranceCession>,
    @InjectRepository(ReinsuranceRecovery)
    private recoveryRepo: Repository<ReinsuranceRecovery>,
    @InjectRepository(ReinsuranceBordereau)
    private bordereauRepo: Repository<ReinsuranceBordereau>,
    private financeService: FinanceService,
    private auditService: AuditService,
  ) {}

  async createTreaty(dto: CreateTreatyDto, userId: string): Promise<ReinsuranceTreaty> {
    if (dto.type === TreatyType.QUOTA_SHARE && !dto.cessionPercentage) {
      throw new BadRequestException('cessionPercentage is required for quota share treaties');
    }
    if ((dto.type === TreatyType.SURPLUS || dto.type === TreatyType.EXCESS_OF_LOSS) && !dto.retentionLimit) {
      throw new BadRequestException('retentionLimit is required for surplus and excess-of-loss treaties');
    }

    const count = await this.treatyRepo.count();
    const treaty = this.treatyRepo.create({
      ...dto,
      effectiveDate: new Date(dto.effectiveDate),
      expiryDate: new Date(dto.expiryDate),
      treatyRef: `EBA-RI-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`,
      status: TreatyStatus.DRAFT,
      createdById: userId,
    });

    const saved = await this.treatyRepo.save(treaty);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'reinsurance_treaty',
      entityId: saved.id, entityRef: saved.treatyRef,
      userId, module: 'finance',
      description: `Reinsurance treaty created: ${saved.treatyRef} - ${saved.reinsurerName} (${saved.type})`,
    });

    return saved;
  }

  async activateTreaty(id: string, userId: string): Promise<ReinsuranceTreaty> {
    const treaty = await this.findTreatyById(id);
    treaty.status = TreatyStatus.ACTIVE;
    const saved = await this.treatyRepo.save(treaty);

    await this.auditService.log({
      action: AuditAction.APPROVE, entityType: 'reinsurance_treaty',
      entityId: id, entityRef: treaty.treatyRef,
      userId, module: 'finance',
      description: `Treaty activated: ${treaty.treatyRef}`,
    });

    return saved;
  }

  async findTreaties(options: { status?: TreatyStatus; page?: number; limit?: number }): Promise<{ data: ReinsuranceTreaty[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const where: any = {};
    if (options.status) where.status = options.status;

    const [data, total] = await this.treatyRepo.findAndCount({
      where, skip: (page - 1) * limit, take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total };
  }

  async findTreatyById(id: string): Promise<ReinsuranceTreaty> {
    const treaty = await this.treatyRepo.findOne({ where: { id } });
    if (!treaty) throw new NotFoundException(`Treaty ${id} not found`);
    return treaty;
  }

  calculateCession(treaty: ReinsuranceTreaty, input: CedePolicyInput): {
    cededSumInsured: number;
    retainedSumInsured: number;
    cededPremium: number;
    retainedPremium: number;
    cessionRatio: number;
    cedingCommission: number;
  } {
    let cededSumInsured = 0;
    let cessionRatio = 0;

    switch (treaty.type) {
      case TreatyType.QUOTA_SHARE:
      case TreatyType.FACULTATIVE: {
        cessionRatio = (treaty.cessionPercentage || 0) / 100;
        cededSumInsured = input.sumInsured * cessionRatio;
        break;
      }
      case TreatyType.SURPLUS: {
        const retention = treaty.retentionLimit || 0;
        const excess = Math.max(0, input.sumInsured - retention);
        cededSumInsured = treaty.maxCessionLimit
          ? Math.min(excess, treaty.maxCessionLimit)
          : excess;
        cessionRatio = input.sumInsured > 0 ? cededSumInsured / input.sumInsured : 0;
        break;
      }
      case TreatyType.EXCESS_OF_LOSS: {
        cededSumInsured = 0;
        cessionRatio = 0;
        break;
      }
    }

    const retainedSumInsured = input.sumInsured - cededSumInsured;
    const cededPremium = Math.round(input.grossPremium * cessionRatio * 100) / 100;
    const retainedPremium = Math.round((input.grossPremium - cededPremium) * 100) / 100;
    const cedingCommission = Math.round(cededPremium * ((treaty.cedingCommissionRate || 0) / 100) * 100) / 100;

    return { cededSumInsured, retainedSumInsured, cededPremium, retainedPremium, cessionRatio, cedingCommission };
  }

  async cedePolicy(treatyId: string, input: CedePolicyInput, userId: string): Promise<ReinsuranceCession | null> {
    const treaty = await this.findTreatyById(treatyId);
    if (treaty.status !== TreatyStatus.ACTIVE) {
      throw new BadRequestException('Treaty is not active');
    }
    if (treaty.type === TreatyType.EXCESS_OF_LOSS) {
      return null;
    }

    const existing = await this.cessionRepo.findOne({ where: { policyId: input.policyId, treatyId } });
    if (existing) return existing;

    const calc = this.calculateCession(treaty, input);
    if (calc.cededSumInsured <= 0) return null;

    const cession = this.cessionRepo.create({
      policyId: input.policyId,
      policyNumber: input.policyNumber,
      treatyId,
      grossSumInsured: input.sumInsured,
      cededSumInsured: calc.cededSumInsured,
      retainedSumInsured: calc.retainedSumInsured,
      grossPremium: input.grossPremium,
      cededPremium: calc.cededPremium,
      retainedPremium: calc.retainedPremium,
      cedingCommission: calc.cedingCommission,
      cessionRatio: calc.cessionRatio,
    });

    const saved = await this.cessionRepo.save(cession);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'reinsurance_cession',
      entityId: saved.id, entityRef: input.policyNumber,
      userId, module: 'finance',
      description: `Policy ceded: ${input.policyNumber} to ${treaty.treatyRef} (USD ${calc.cededPremium.toFixed(2)} premium, ${(calc.cessionRatio * 100).toFixed(1)}% ratio)`,
    });

    return saved;
  }

  async getCessionForPolicy(policyId: string): Promise<ReinsuranceCession[]> {
    return this.cessionRepo.find({ where: { policyId } });
  }

  async calculateAndRecordRecovery(
    treatyId: string,
    claimId: string,
    claimNumber: string,
    grossClaimAmount: number,
    userId: string,
  ): Promise<ReinsuranceRecovery | null> {
    const treaty = await this.findTreatyById(treatyId);

    let recoverableAmount = 0;

    if (treaty.type === TreatyType.EXCESS_OF_LOSS) {
      const retention = treaty.retentionLimit || 0;
      const layerLimit = treaty.maxCessionLimit || Infinity;
      const excess = Math.max(0, grossClaimAmount - retention);
      recoverableAmount = Math.min(excess, layerLimit);
    } else {
      return null;
    }

    if (recoverableAmount <= 0) return null;

    const recovery = this.recoveryRepo.create({
      claimId, claimNumber, treatyId,
      grossClaimAmount, recoverableAmount,
      status: RecoveryStatus.PENDING,
    });

    const saved = await this.recoveryRepo.save(recovery);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'reinsurance_recovery',
      entityId: saved.id, entityRef: claimNumber,
      userId, module: 'finance',
      description: `Recovery calculated for claim ${claimNumber}: USD ${recoverableAmount.toFixed(2)} recoverable from ${treaty.treatyRef}`,
    });

    return saved;
  }

  async calculateRecoveryForCession(
    cessionId: string,
    claimId: string,
    claimNumber: string,
    grossClaimAmount: number,
    userId: string,
  ): Promise<ReinsuranceRecovery> {
    const cession = await this.cessionRepo.findOne({ where: { id: cessionId } });
    if (!cession) throw new NotFoundException('Cession record not found');

    const recoverableAmount = Math.round(grossClaimAmount * Number(cession.cessionRatio) * 100) / 100;

    const recovery = this.recoveryRepo.create({
      claimId, claimNumber,
      treatyId: cession.treatyId,
      cessionId: cession.id,
      grossClaimAmount,
      recoverableAmount,
      status: RecoveryStatus.PENDING,
    });

    const saved = await this.recoveryRepo.save(recovery);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'reinsurance_recovery',
      entityId: saved.id, entityRef: claimNumber,
      userId, module: 'finance',
      description: `Recovery calculated for claim ${claimNumber}: USD ${recoverableAmount.toFixed(2)} (cession ratio ${(Number(cession.cessionRatio) * 100).toFixed(1)}%)`,
    });

    return saved;
  }

  async confirmRecoveryReceived(recoveryId: string, amount: number, userId: string): Promise<ReinsuranceRecovery> {
    const recovery = await this.recoveryRepo.findOne({ where: { id: recoveryId } });
    if (!recovery) throw new NotFoundException('Recovery record not found');

    recovery.recoveredAmount = amount;
    recovery.status = RecoveryStatus.RECEIVED;
    recovery.receivedAt = new Date();
    const saved = await this.recoveryRepo.save(recovery);

    await this.financeService.postJournal({
      source: GlEntrySource.REINSURANCE_RECOVERY,
      sourceId: recovery.id,
      sourceRef: recovery.claimNumber,
      description: `Reinsurance recovery received: ${recovery.claimNumber}`,
      currency: 'USD',
      lines: [
        { accountCode: '1100', debit: amount, description: 'Recovery received from reinsurer' },
        { accountCode: '1400', credit: amount, description: 'Reinsurance recoverable cleared' },
      ],
    }, userId);

    recovery.glPosted = true;
    await this.recoveryRepo.save(recovery);

    return saved;
  }

  async generateMonthlyBordereau(treatyId: string, period: string, userId: string): Promise<ReinsuranceBordereau> {
    const treaty = await this.findTreatyById(treatyId);

    const existing = await this.bordereauRepo.findOne({ where: { treatyId, period } });
    if (existing) throw new BadRequestException(`Bordereau for ${period} already exists for this treaty`);

    const allCessions = await this.cessionRepo.find({ where: { treatyId } });
    const cessions = allCessions.filter(c => !c.bordereauPeriod);

    const allRecoveries = await this.recoveryRepo.find({ where: { treatyId, status: RecoveryStatus.RECEIVED } });
    const recoveries = allRecoveries.filter(r => !r.bordereauPeriod);

    const premiumCessions = cessions.map(c => ({
      policyNumber: c.policyNumber,
      grossPremium: Number(c.grossPremium),
      cededPremium: Number(c.cededPremium),
      cedingCommission: Number(c.cedingCommission),
    }));

    const claimRecoveries = recoveries.map(r => ({
      claimNumber: r.claimNumber,
      grossClaimAmount: Number(r.grossClaimAmount),
      recoverableAmount: Number(r.recoverableAmount),
    }));

    const totalCededPremium = premiumCessions.reduce((s, c) => s + c.cededPremium, 0);
    const totalCedingCommission = premiumCessions.reduce((s, c) => s + c.cedingCommission, 0);
    const totalRecoveries = claimRecoveries.reduce((s, c) => s + c.recoverableAmount, 0);
    const netDueToReinsurer = totalCededPremium - totalCedingCommission - totalRecoveries;

    const count = await this.bordereauRepo.count();
    const bordereau = this.bordereauRepo.create({
      bordereauNumber: `EBA-BDX-${period}-${treaty.treatyRef.split('-').pop()}`,
      treatyId,
      period,
      premiumCessions,
      claimRecoveries,
      totalCededPremium,
      totalCedingCommission,
      totalRecoveries,
      netDueToReinsurer,
      status: BordereauStatus.ISSUED,
      issuedAt: new Date(),
      generatedById: userId,
    });

    const saved = await this.bordereauRepo.save(bordereau);

    for (const c of cessions) {
      c.bordereauPeriod = period;
      await this.cessionRepo.save(c);
    }
    for (const r of recoveries) {
      r.bordereauPeriod = period;
      await this.recoveryRepo.save(r);
    }

    if (totalCededPremium > 0) {
      const lines: any[] = [
        { accountCode: '4100', debit: totalCededPremium, description: 'Premium ceded to reinsurer' },
        { accountCode: '1400', debit: totalCedingCommission, description: 'Ceding commission receivable' },
        { accountCode: '2500', credit: totalCededPremium - totalCedingCommission, description: 'Net payable to reinsurer' },
      ];
      if (totalRecoveries > 0) {
        lines.push({ accountCode: '1400', debit: totalRecoveries, description: 'Recoveries receivable' });
      }

      await this.financeService.postJournal({
        source: GlEntrySource.REINSURANCE_CESSION,
        sourceRef: saved.bordereauNumber,
        description: `Reinsurance cession bordereau ${period} - ${treaty.reinsurerName}`,
        currency: 'USD',
        period,
        lines,
      }, userId);
    }

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'reinsurance_bordereau',
      entityId: saved.id, entityRef: saved.bordereauNumber,
      userId, module: 'finance',
      description: `Bordereau generated: ${saved.bordereauNumber} - ${premiumCessions.length} cessions, ${claimRecoveries.length} recoveries, net due USD ${netDueToReinsurer.toFixed(2)}`,
    });

    return saved;
  }

  async getBordereaux(treatyId: string): Promise<ReinsuranceBordereau[]> {
    return this.bordereauRepo.find({ where: { treatyId }, order: { period: 'DESC' } });
  }

  async settleBordereau(bordereauId: string, settlementRef: string, userId: string): Promise<ReinsuranceBordereau> {
    const bordereau = await this.bordereauRepo.findOne({ where: { id: bordereauId } });
    if (!bordereau) throw new NotFoundException('Bordereau not found');

    bordereau.status = BordereauStatus.SETTLED;
    bordereau.settledAt = new Date();
    bordereau.settlementRef = settlementRef;
    const saved = await this.bordereauRepo.save(bordereau);

    await this.financeService.postJournal({
      source: GlEntrySource.REINSURANCE_CESSION,
      sourceRef: bordereau.bordereauNumber,
      description: `Bordereau settled: ${bordereau.bordereauNumber}`,
      currency: 'USD',
      lines: [
        { accountCode: '2500', debit: bordereau.netDueToReinsurer, description: 'Reinsurance payable settled' },
        { accountCode: '1100', credit: bordereau.netDueToReinsurer, description: 'Bank - settlement payment' },
      ],
    }, userId);

    return saved;
  }

  async getSummary(): Promise<{
    activeTreaties: number;
    totalCededPremium: number;
    totalRecoverable: number;
    totalRecovered: number;
    pendingRecoveries: number;
  }> {
    const activeTreaties = await this.treatyRepo.count({ where: { status: TreatyStatus.ACTIVE } });

    const cessionResult = await this.cessionRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.cededPremium), 0)', 'total')
      .getRawOne();

    const recoverableResult = await this.recoveryRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.recoverableAmount), 0)', 'total')
      .where("r.status != 'received'")
      .getRawOne();

    const recoveredResult = await this.recoveryRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.recoveredAmount), 0)', 'total')
      .where("r.status = 'received'")
      .getRawOne();

    const pendingRecoveries = await this.recoveryRepo.count({ where: { status: RecoveryStatus.PENDING } });

    return {
      activeTreaties,
      totalCededPremium: parseFloat(cessionResult?.total || '0'),
      totalRecoverable: parseFloat(recoverableResult?.total || '0'),
      totalRecovered: parseFloat(recoveredResult?.total || '0'),
      pendingRecoveries,
    };
  }
}
