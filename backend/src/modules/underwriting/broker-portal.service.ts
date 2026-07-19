import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Broker, BrokerStatus, BrokerType } from './entities/broker.entity';
import { CommissionStatement, CommissionStatementStatus } from './entities/commission-statement.entity';
import { Policy, PolicyStatus } from './entities/policy.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';

export interface CreateBrokerDto {
  name: string;
  type: BrokerType;
  email: string;
  phone: string;
  ipecLicenseNumber?: string;
  licenseExpiryDate?: string;
  defaultCommissionRate?: number;
  mobileMoneyNumber?: string;
}

@Injectable()
export class BrokerPortalService {
  constructor(
    @InjectRepository(Broker)
    private brokerRepo: Repository<Broker>,
    @InjectRepository(CommissionStatement)
    private statementRepo: Repository<CommissionStatement>,
    @InjectRepository(Policy)
    private policyRepo: Repository<Policy>,
    private auditService: AuditService,
  ) {}

  // ── BROKER ACCREDITATION ──────────────────────────────────────────────────

  async createBroker(dto: CreateBrokerDto, createdById: string): Promise<Broker> {
    const existing = await this.brokerRepo.findOne({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException(`Broker with email ${dto.email} already exists`);

    const count = await this.brokerRepo.count();
    const broker = this.brokerRepo.create({
      ...dto,
      email: dto.email.toLowerCase(),
      brokerCode: `EBA-BRK-${String(count + 1).padStart(6, '0')}`,
      licenseExpiryDate: dto.licenseExpiryDate ? new Date(dto.licenseExpiryDate) : undefined,
      status: BrokerStatus.PENDING_ACCREDITATION,
    });

    const saved = await this.brokerRepo.save(broker);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'broker',
      entityId: saved.id, entityRef: saved.brokerCode,
      userId: createdById, module: 'underwriting',
      description: `Broker registered: ${saved.brokerCode} — ${saved.name}`,
    });

    return saved;
  }

  async accreditBroker(brokerId: string, userId: string): Promise<Broker> {
    const broker = await this.findBrokerById(brokerId);
    if (!broker.ipecLicenseNumber) {
      throw new BadRequestException('IPEC license number is required before accreditation');
    }
    broker.status = BrokerStatus.ACTIVE;
    broker.accreditedAt = new Date();
    broker.accreditedById = userId;
    const saved = await this.brokerRepo.save(broker);

    await this.auditService.log({
      action: AuditAction.APPROVE, entityType: 'broker',
      entityId: brokerId, entityRef: broker.brokerCode,
      userId, module: 'underwriting',
      description: `Broker accredited: ${broker.brokerCode}`,
    });

    return saved;
  }

  async suspendBroker(brokerId: string, reason: string, userId: string): Promise<Broker> {
    const broker = await this.findBrokerById(brokerId);
    broker.status = BrokerStatus.SUSPENDED;
    broker.notes = reason;
    const saved = await this.brokerRepo.save(broker);

    await this.auditService.log({
      action: AuditAction.UPDATE, entityType: 'broker',
      entityId: brokerId, entityRef: broker.brokerCode,
      userId, module: 'underwriting',
      description: `Broker suspended: ${broker.brokerCode} — ${reason}`,
    });

    return saved;
  }

  async findBrokers(options: {
    status?: BrokerStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Broker[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const qb = this.brokerRepo.createQueryBuilder('b');

    if (options.status) qb.andWhere('b.status = :s', { s: options.status });
    if (options.search) {
      qb.andWhere('(b.name ILIKE :s OR b.email ILIKE :s OR b.brokerCode ILIKE :s)',
        { s: `%${options.search}%` });
    }

    qb.orderBy('b.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findBrokerById(id: string): Promise<Broker> {
    const broker = await this.brokerRepo.findOne({ where: { id } });
    if (!broker) throw new NotFoundException(`Broker ${id} not found`);
    return broker;
  }

  async findBrokerByCode(code: string): Promise<Broker> {
    const broker = await this.brokerRepo.findOne({ where: { brokerCode: code } });
    if (!broker) throw new NotFoundException(`Broker ${code} not found`);
    return broker;
  }

  // ── BAP-02: CLIENT PORTFOLIO VIEW ────────────────────────────────────────
  // "All policies, renewals due, claims in progress — loads in under 5 seconds"

  async getClientPortfolio(brokerId: string): Promise<{
    totalPolicies: number;
    activePolicies: number;
    renewalsDue: Array<{ policyNumber: string; customerEmail: string; daysToRenewal: number; premium: number }>;
    policies: Policy[];
  }> {
    await this.findBrokerById(brokerId);

    const policies = await this.policyRepo.find({
      where: { brokerId },
      relations: ['customer', 'product'],
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const activePolicies = policies.filter(p => p.status === PolicyStatus.ACTIVE);
    const now = new Date();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 30);

    const renewalsDue = activePolicies
      .filter(p => new Date(p.endDate) <= cutoff)
      .map(p => ({
        policyNumber: p.policyNumber,
        customerEmail: p.customer?.email || '—',
        daysToRenewal: Math.ceil((new Date(p.endDate).getTime() - now.getTime()) / 86400000),
        premium: Number(p.grossPremium),
      }))
      .sort((a, b) => a.daysToRenewal - b.daysToRenewal);

    return {
      totalPolicies: policies.length,
      activePolicies: activePolicies.length,
      renewalsDue,
      policies,
    };
  }

  // ── BAP-03: COMMISSION STATEMENTS ────────────────────────────────────────
  // "Monthly commission statement available by 5th of following month"

  async generateMonthlyStatement(brokerId: string, period: string, userId: string): Promise<CommissionStatement> {
    const broker = await this.findBrokerById(brokerId);

    const existing = await this.statementRepo.findOne({ where: { brokerId, period } });
    if (existing) throw new ConflictException(`Statement for ${period} already exists for this broker`);

    const [year, month] = period.split('-').map(Number);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);

    const policies = await this.policyRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.product', 'product')
      .where('p.brokerId = :brokerId', { brokerId })
      .andWhere('p.createdAt BETWEEN :from AND :to', { from, to })
      .andWhere("p.status NOT IN ('quotation','cancelled')")
      .getMany();

    const lineItems = policies.map(p => ({
      policyNumber: p.policyNumber,
      productName: p.product?.name || 'Unknown',
      grossPremium: Number(p.grossPremium),
      commissionRate: p.product?.brokerCommissionRate || broker.defaultCommissionRate,
      commissionAmount: Number(p.brokerCommission),
      transactionType: p.renewalCount > 1 ? 'renewal' : 'new_business',
    }));

    const totalCommission = lineItems.reduce((s, l) => s + l.commissionAmount, 0);
    const statementNumber = `EBA-COM-${period}-${broker.brokerCode.split('-').pop()}`;

    const statement = this.statementRepo.create({
      statementNumber,
      brokerId,
      period,
      lineItems,
      totalCommission,
      status: CommissionStatementStatus.ISSUED,
    });

    const saved = await this.statementRepo.save(statement);

    // Update broker running totals
    broker.totalCommissionEarned = Number(broker.totalCommissionEarned) + totalCommission;
    broker.outstandingCommission = Number(broker.outstandingCommission) + totalCommission;
    await this.brokerRepo.save(broker);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'commission_statement',
      entityId: saved.id, entityRef: statementNumber,
      userId, module: 'underwriting',
      description: `Commission statement generated: ${statementNumber} — ${lineItems.length} policies, USD ${totalCommission.toFixed(2)}`,
    });

    return saved;
  }

  async getStatements(brokerId: string): Promise<CommissionStatement[]> {
    return this.statementRepo.find({
      where: { brokerId },
      order: { period: 'DESC' },
    });
  }

  async queryStatement(statementId: string, notes: string, userId: string): Promise<CommissionStatement> {
    const statement = await this.statementRepo.findOne({ where: { id: statementId } });
    if (!statement) throw new NotFoundException('Statement not found');
    statement.status = CommissionStatementStatus.QUERIED;
    statement.queryNotes = notes;
    return this.statementRepo.save(statement);
  }

  async markStatementPaid(statementId: string, paymentRef: string, userId: string): Promise<CommissionStatement> {
    const statement = await this.statementRepo.findOne({ where: { id: statementId } });
    if (!statement) throw new NotFoundException('Statement not found');

    statement.status = CommissionStatementStatus.PAID;
    statement.paidAt = new Date();
    statement.paymentRef = paymentRef;
    const saved = await this.statementRepo.save(statement);

    const broker = await this.findBrokerById(statement.brokerId);
    broker.totalCommissionPaid = Number(broker.totalCommissionPaid) + Number(statement.totalCommission);
    broker.outstandingCommission = Math.max(0, Number(broker.outstandingCommission) - Number(statement.totalCommission));
    await this.brokerRepo.save(broker);

    await this.auditService.log({
      action: AuditAction.APPROVE, entityType: 'commission_statement',
      entityId: statementId, entityRef: statement.statementNumber,
      userId, module: 'underwriting',
      description: `Commission paid: ${statement.statementNumber} — ${paymentRef}`,
    });

    return saved;
  }

  // ── BAP-04: PERFORMANCE REPORTING ────────────────────────────────────────
  // "GWP contribution, conversion rates, renewal retention"

  async getPerformanceReport(brokerId: string, from: Date, to: Date): Promise<{
    broker: { code: string; name: string };
    gwpContribution: number;
    policyCount: number;
    renewalCount: number;
    renewalRetentionRate: number;
    avgPolicySize: number;
    commissionEarned: number;
  }> {
    const broker = await this.findBrokerById(brokerId);

    const policies = await this.policyRepo
      .createQueryBuilder('p')
      .where('p.brokerId = :brokerId', { brokerId })
      .andWhere('p.createdAt BETWEEN :from AND :to', { from, to })
      .andWhere("p.status NOT IN ('quotation','cancelled')")
      .getMany();

    const gwpContribution = policies.reduce((s, p) => s + Number(p.grossPremium), 0);
    const renewalCount = policies.filter(p => p.renewalCount > 1).length;
    const commissionEarned = policies.reduce((s, p) => s + Number(p.brokerCommission), 0);

    // Renewal retention: renewed vs (renewed + lapsed) for this broker's expiring book
    const expired = await this.policyRepo.count({
      where: { brokerId, status: PolicyStatus.EXPIRED } as any,
    });
    const renewed = await this.policyRepo.count({
      where: { brokerId, status: PolicyStatus.RENEWED } as any,
    });
    const totalDue = expired + renewed;
    const renewalRetentionRate = totalDue > 0 ? (renewed / totalDue) * 100 : 0;

    return {
      broker: { code: broker.brokerCode, name: broker.name },
      gwpContribution,
      policyCount: policies.length,
      renewalCount,
      renewalRetentionRate,
      avgPolicySize: policies.length > 0 ? gwpContribution / policies.length : 0,
      commissionEarned,
    };
  }
}
