import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Policy, PolicyStatus } from '../underwriting/entities/policy.entity';
import { Claim, ClaimStatus } from '../claims/entities/claim.entity';
import { Invoice, InvoiceStatus } from '../finance/entities/invoice.entity';
import { Payment, PaymentStatus } from '../finance/entities/payment.entity';
import { Customer } from '../crm/entities/customer.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';

export interface DateRangeDto {
  from: Date;
  to: Date;
}

@Injectable()
export class ReportingService {
  constructor(
    @InjectRepository(Policy)
    private policyRepo: Repository<Policy>,
    @InjectRepository(Claim)
    private claimRepo: Repository<Claim>,
    @InjectRepository(Invoice)
    private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,
  ) {}

  // ── EXECUTIVE KPI DASHBOARD ───────────────────────────────────────────────

  async getExecutiveDashboard(): Promise<{
    gwp: { current: number; previousMonth: number; ytd: number; growth: number };
    policies: { active: number; lapsed: number; pendingPayment: number; expiringSoon: number };
    claims: { open: number; settled: number; claimsRatio: number; avgDays: number; fraudFlagged: number };
    customers: { total: number; newThisMonth: number; kycPending: number };
    collections: { thisMonth: number; outstanding: number; collectionRate: number };
    retention: { renewalRate: number; lapseRate: number };
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const in30Days = new Date(); in30Days.setDate(in30Days.getDate() + 30);

    // GWP calculations
    const gwpCurrentResult = await this.policyRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.grossPremium), 0)', 'total')
      .where('p.createdAt BETWEEN :start AND :end', { start: startOfMonth, end: now })
      .andWhere("p.status NOT IN ('quotation','cancelled')")
      .getRawOne();

    const gwpPrevResult = await this.policyRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.grossPremium), 0)', 'total')
      .where('p.createdAt BETWEEN :start AND :end', { start: startOfLastMonth, end: endOfLastMonth })
      .andWhere("p.status NOT IN ('quotation','cancelled')")
      .getRawOne();

    const gwpYtdResult = await this.policyRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.grossPremium), 0)', 'total')
      .where('p.createdAt >= :start', { start: startOfYear })
      .andWhere("p.status NOT IN ('quotation','cancelled')")
      .getRawOne();

    const gwpCurrent = parseFloat(gwpCurrentResult?.total || '0');
    const gwpPrev = parseFloat(gwpPrevResult?.total || '0');
    const gwpYtd = parseFloat(gwpYtdResult?.total || '0');
    const gwpGrowth = gwpPrev > 0 ? ((gwpCurrent - gwpPrev) / gwpPrev) * 100 : 0;

    // Policies
    const [activePolicies, lapseCount, pendingPayment, expiringSoon] = await Promise.all([
      this.policyRepo.count({ where: { status: PolicyStatus.ACTIVE } }),
      this.policyRepo.count({ where: { status: PolicyStatus.LAPSED } }),
      this.policyRepo.count({ where: { status: PolicyStatus.PENDING_PAYMENT } }),
      this.policyRepo.createQueryBuilder('p')
        .where('p.endDate BETWEEN :now AND :cutoff', { now, cutoff: in30Days })
        .andWhere("p.status = 'active'").getCount(),
    ]);

    // Claims
    const openClaims = await this.claimRepo
      .createQueryBuilder('c')
      .where("c.status NOT IN ('settled','closed','rejected','withdrawn')")
      .getCount();
    const settledClaims = await this.claimRepo.count({ where: { status: ClaimStatus.SETTLED } });
    const fraudFlagged = await this.claimRepo.count({ where: { fraudFlagged: true } });

    const claimsAmountResult = await this.claimRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.settlementAmount), 0)', 'settled')
      .where("c.status = 'settled'")
      .getRawOne();

    const gwpTotalResult = await this.policyRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.grossPremium), 0)', 'total')
      .where("p.status NOT IN ('quotation','cancelled')")
      .getRawOne();

    const totalGwp = parseFloat(gwpTotalResult?.total || '0');
    const totalClaims = parseFloat(claimsAmountResult?.settled || '0');
    const claimsRatio = totalGwp > 0 ? (totalClaims / totalGwp) * 100 : 0;

    const avgDaysResult = await this.claimRepo
      .createQueryBuilder('c')
      .select('AVG(EXTRACT(EPOCH FROM (c.settlementDate - c.fnolDate)) / 86400)', 'avg')
      .where("c.status = 'settled' AND c.settlementDate IS NOT NULL")
      .getRawOne();
    const avgDays = parseFloat(avgDaysResult?.avg || '0');

    // Customers
    const totalCustomers = await this.customerRepo.count();
    const newThisMonth = await this.customerRepo
      .createQueryBuilder('c')
      .where('c.createdAt >= :start', { start: startOfMonth })
      .getCount();
    const kycPending = await this.customerRepo
      .createQueryBuilder('c')
      .where("c.kycStatus IN ('not_submitted', 'pending_review')")
      .getCount();

    // Collections
    const collectedResult = await this.paymentRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where("p.status = 'success'")
      .andWhere('p.initiatedAt >= :start', { start: startOfMonth })
      .andWhere("p.paymentType = 'premium_collection'")
      .getRawOne();

    const outstandingResult = await this.invoiceRepo
      .createQueryBuilder('i')
      .select('COALESCE(SUM(i.outstandingAmount), 0)', 'total')
      .where("i.status IN ('issued','partially_paid','overdue')")
      .getRawOne();

    const collected = parseFloat(collectedResult?.total || '0');
    const outstanding = parseFloat(outstandingResult?.total || '0');
    const collectionRate = (collected + outstanding) > 0
      ? (collected / (collected + outstanding)) * 100
      : 0;

    // Retention
    const renewedCount = await this.policyRepo.count({ where: { status: PolicyStatus.RENEWED } });
    const lapseTotal = await this.policyRepo
      .createQueryBuilder('p')
      .where("p.status IN ('lapsed','expired')")
      .getCount();
    const totalEnded = renewedCount + lapseTotal;
    const renewalRate = totalEnded > 0 ? (renewedCount / totalEnded) * 100 : 0;
    const lapseRate = totalEnded > 0 ? (lapseTotal / totalEnded) * 100 : 0;

    return {
      gwp: { current: gwpCurrent, previousMonth: gwpPrev, ytd: gwpYtd, growth: gwpGrowth },
      policies: { active: activePolicies, lapsed: lapseCount, pendingPayment, expiringSoon },
      claims: { open: openClaims, settled: settledClaims, claimsRatio, avgDays, fraudFlagged },
      customers: { total: totalCustomers, newThisMonth, kycPending },
      collections: { thisMonth: collected, outstanding, collectionRate },
      retention: { renewalRate, lapseRate },
    };
  }

  // ── MANAGEMENT REPORTS ────────────────────────────────────────────────────

  async getGwpReport(range: DateRangeDto): Promise<{
    byProduct: Array<{ product: string; policies: number; gwp: number; avgPremium: number }>;
    byChannel: Array<{ channel: string; policies: number; gwp: number }>;
    byMonth: Array<{ month: string; gwp: number; policies: number }>;
    total: number;
  }> {
    const base = this.policyRepo.createQueryBuilder('p')
      .leftJoin('p.product', 'prod')
      .where('p.createdAt BETWEEN :from AND :to', { from: range.from, to: range.to })
      .andWhere("p.status NOT IN ('quotation','cancelled')");

    const byProductRaw = await base.clone()
      .select('prod.name', 'product')
      .addSelect('COUNT(p.id)', 'policies')
      .addSelect('COALESCE(SUM(p.grossPremium), 0)', 'gwp')
      .groupBy('prod.name')
      .getRawMany();

    const byChannelRaw = await base.clone()
      .select('p.distributionChannel', 'channel')
      .addSelect('COUNT(p.id)', 'policies')
      .addSelect('COALESCE(SUM(p.grossPremium), 0)', 'gwp')
      .groupBy('p.distributionChannel')
      .getRawMany();

    const byMonthRaw = await base.clone()
      .select("TO_CHAR(p.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(p.grossPremium), 0)', 'gwp')
      .addSelect('COUNT(p.id)', 'policies')
      .groupBy("TO_CHAR(p.createdAt, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany();

    const totalResult = await base.clone()
      .select('COALESCE(SUM(p.grossPremium), 0)', 'total')
      .getRawOne();

    return {
      byProduct: byProductRaw.map((r) => ({
        product: r.product || 'Unknown',
        policies: parseInt(r.policies),
        gwp: parseFloat(r.gwp),
        avgPremium: parseInt(r.policies) > 0 ? parseFloat(r.gwp) / parseInt(r.policies) : 0,
      })),
      byChannel: byChannelRaw.map((r) => ({
        channel: r.channel || 'Unknown',
        policies: parseInt(r.policies),
        gwp: parseFloat(r.gwp),
      })),
      byMonth: byMonthRaw.map((r) => ({
        month: r.month,
        gwp: parseFloat(r.gwp),
        policies: parseInt(r.policies),
      })),
      total: parseFloat(totalResult?.total || '0'),
    };
  }

  async getClaimsReport(range: DateRangeDto): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    claimsRatio: number;
    totalReserved: number;
    totalSettled: number;
    avgSettlementDays: number;
    fraud: { flagged: number; percentage: number };
  }> {
    const qb = this.claimRepo.createQueryBuilder('c')
      .where('c.fnolDate BETWEEN :from AND :to', { from: range.from, to: range.to });

    const total = await qb.clone().getCount();

    const byStatusRaw = await qb.clone()
      .select('c.status', 'status')
      .addSelect('COUNT(c.id)', 'count')
      .groupBy('c.status')
      .getRawMany();

    const byTypeRaw = await qb.clone()
      .select('c.claimType', 'type')
      .addSelect('COUNT(c.id)', 'count')
      .groupBy('c.claimType')
      .getRawMany();

    const byStatus: Record<string, number> = {};
    for (const r of byStatusRaw) byStatus[r.status] = parseInt(r.count);

    const byType: Record<string, number> = {};
    for (const r of byTypeRaw) byType[r.type] = parseInt(r.count);

    const reserveResult = await qb.clone()
      .select('COALESCE(SUM(c.reserveAmount), 0)', 'total')
      .getRawOne();

    const settledResult = await qb.clone()
      .select('COALESCE(SUM(c.settlementAmount), 0)', 'total')
      .where('c.fnolDate BETWEEN :from AND :to', { from: range.from, to: range.to })
      .andWhere("c.status = 'settled'")
      .getRawOne();

    const fraudCount = await qb.clone()
      .andWhere('c.fraudFlagged = true')
      .getCount();

    const avgResult = await qb.clone()
      .select('AVG(EXTRACT(EPOCH FROM (c.settlementDate - c.fnolDate)) / 86400)', 'avg')
      .where('c.fnolDate BETWEEN :from AND :to', { from: range.from, to: range.to })
      .andWhere("c.status = 'settled' AND c.settlementDate IS NOT NULL")
      .getRawOne();

    const gwpResult = await this.policyRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.grossPremium), 0)', 'total')
      .where('p.startDate BETWEEN :from AND :to', { from: range.from, to: range.to })
      .andWhere("p.status NOT IN ('quotation','cancelled')")
      .getRawOne();

    const totalSettled = parseFloat(settledResult?.total || '0');
    const totalGwp = parseFloat(gwpResult?.total || '0');

    return {
      total,
      byStatus,
      byType,
      claimsRatio: totalGwp > 0 ? (totalSettled / totalGwp) * 100 : 0,
      totalReserved: parseFloat(reserveResult?.total || '0'),
      totalSettled,
      avgSettlementDays: parseFloat(avgResult?.avg || '0'),
      fraud: { flagged: fraudCount, percentage: total > 0 ? (fraudCount / total) * 100 : 0 },
    };
  }

  async getOutstandingPremiumsReport(): Promise<{
    total: number;
    aged: { current: number; days30: number; days60: number; days90plus: number };
    byCustomer: Array<{ customerNumber: string; name: string; outstanding: number; oldestDays: number }>;
  }> {
    const now = new Date();
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const d60 = new Date(now); d60.setDate(d60.getDate() - 60);
    const d90 = new Date(now); d90.setDate(d90.getDate() - 90);

    const outstandingInvoices = await this.invoiceRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.customer', 'c')
      .where("i.status IN ('issued','partially_paid','overdue')")
      .andWhere('i.outstandingAmount > 0')
      .orderBy('i.dueDate', 'ASC')
      .getMany();

    let total = 0, current = 0, days30 = 0, days60 = 0, days90plus = 0;
    const customerMap: Record<string, any> = {};

    for (const inv of outstandingInvoices) {
      const amt = inv.outstandingAmount;
      total += amt;
      const dueDate = new Date(inv.dueDate);
      const daysPastDue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);

      if (daysPastDue <= 0) current += amt;
      else if (daysPastDue <= 30) days30 += amt;
      else if (daysPastDue <= 60) days60 += amt;
      else days90plus += amt;

      if (inv.customerId) {
        if (!customerMap[inv.customerId]) {
          customerMap[inv.customerId] = {
            customerNumber: inv.customer?.customerNumber,
            name: inv.customer?.fullName,
            outstanding: 0,
            oldestDays: 0,
          };
        }
        customerMap[inv.customerId].outstanding += amt;
        customerMap[inv.customerId].oldestDays = Math.max(
          customerMap[inv.customerId].oldestDays, Math.max(0, daysPastDue),
        );
      }
    }

    return {
      total,
      aged: { current, days30, days60, days90plus },
      byCustomer: Object.values(customerMap)
        .sort((a: any, b: any) => b.outstanding - a.outstanding)
        .slice(0, 50),
    };
  }

  // ── IPEC REGULATORY REPORTING ─────────────────────────────────────────────

  async getIpecReturn(quarter: string): Promise<{
    period: string;
    premiumIncome: { byClass: Record<string, number>; total: number };
    claimsIncurred: { byClass: Record<string, number>; total: number };
    outstandingClaims: { count: number; reserve: number };
    policiesInForce: number;
    newBusinessCount: number;
    solvencyMargin: {
      minimumRequired: number;
      held: number;
      ratio: number;
      isCompliant: boolean;
    };
    reportGeneratedAt: string;
  }> {
    const [year, q] = quarter.split('-Q');
    const qNum = parseInt(q);
    const fromMonth = (qNum - 1) * 3;
    const from = new Date(parseInt(year), fromMonth, 1);
    const to = new Date(parseInt(year), fromMonth + 3, 0);

    const premiumByClass = await this.policyRepo
      .createQueryBuilder('p')
      .leftJoin('p.product', 'prod')
      .select('prod.type', 'class')
      .addSelect('COALESCE(SUM(p.netPremium), 0)', 'premium')
      .where('p.startDate BETWEEN :from AND :to', { from, to })
      .andWhere("p.status NOT IN ('quotation','cancelled')")
      .groupBy('prod.type')
      .getRawMany();

    const claimsByClass = await this.claimRepo
      .createQueryBuilder('c')
      .leftJoin('c.policy', 'pol')
      .leftJoin('pol.product', 'prod')
      .select('prod.type', 'class')
      .addSelect('COALESCE(SUM(c.settlementAmount), 0)', 'amount')
      .where('c.fnolDate BETWEEN :from AND :to', { from, to })
      .andWhere("c.status = 'settled'")
      .groupBy('prod.type')
      .getRawMany();

    const premiumIncome: Record<string, number> = {};
    let totalPremium = 0;
    for (const r of premiumByClass) {
      premiumIncome[r.class || 'other'] = parseFloat(r.premium);
      totalPremium += parseFloat(r.premium);
    }

    const claimsIncurred: Record<string, number> = {};
    let totalClaims = 0;
    for (const r of claimsByClass) {
      claimsIncurred[r.class || 'other'] = parseFloat(r.amount);
      totalClaims += parseFloat(r.amount);
    }

    const outstandingResult = await this.claimRepo
      .createQueryBuilder('c')
      .select('COUNT(c.id)', 'count')
      .addSelect('COALESCE(SUM(c.reserveAmount), 0)', 'reserve')
      .where("c.status NOT IN ('settled','closed','rejected','withdrawn')")
      .getRawOne();

    const policiesInForce = await this.policyRepo.count({ where: { status: PolicyStatus.ACTIVE } });
    const newBusiness = await this.policyRepo
      .createQueryBuilder('p')
      .where('p.createdAt BETWEEN :from AND :to', { from, to })
      .andWhere("p.status != 'quotation'")
      .getCount();

    const minSolvency = totalPremium * 0.1;
    const solvencyHeld = totalPremium - totalClaims;

    return {
      period: quarter,
      premiumIncome: { byClass: premiumIncome, total: totalPremium },
      claimsIncurred: { byClass: claimsIncurred, total: totalClaims },
      outstandingClaims: {
        count: parseInt(outstandingResult?.count || '0'),
        reserve: parseFloat(outstandingResult?.reserve || '0'),
      },
      policiesInForce,
      newBusinessCount: newBusiness,
      solvencyMargin: {
        minimumRequired: minSolvency,
        held: solvencyHeld,
        ratio: minSolvency > 0 ? (solvencyHeld / minSolvency) * 100 : 0,
        isCompliant: solvencyHeld >= minSolvency,
      },
      reportGeneratedAt: new Date().toISOString(),
    };
  }

  async getFiuAmlReport(range: DateRangeDto): Promise<{
    period: { from: string; to: string };
    highValueTransactions: Array<{ ref: string; amount: number; channel: string; date: string }>;
    suspiciousTransactions: any[];
    kycNonCompliant: number;
    reportGeneratedAt: string;
  }> {
    const HIGH_VALUE_THRESHOLD = 10000; // USD

    const highValue = await this.paymentRepo
      .createQueryBuilder('p')
      .where("p.status = 'success'")
      .andWhere('p.amount >= :threshold', { threshold: HIGH_VALUE_THRESHOLD })
      .andWhere('p.initiatedAt BETWEEN :from AND :to', { from: range.from, to: range.to })
      .orderBy('p.amount', 'DESC')
      .take(100)
      .getMany();

    const kycNonCompliant = await this.customerRepo
      .createQueryBuilder('c')
      .where("c.kycStatus NOT IN ('approved')")
      .andWhere("c.status = 'active'")
      .getCount();

    return {
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      highValueTransactions: highValue.map((p) => ({
        ref: p.paymentRef,
        amount: p.amount,
        channel: p.channel,
        date: p.initiatedAt.toISOString(),
      })),
      suspiciousTransactions: [],
      kycNonCompliant,
      reportGeneratedAt: new Date().toISOString(),
    };
  }

  async getBrokerPerformanceReport(range: DateRangeDto): Promise<{
    brokers: Array<{
      brokerId: string;
      policyCount: number;
      gwp: number;
      commission: number;
    }>;
    total: { policies: number; gwp: number; commission: number };
  }> {
    const raw = await this.policyRepo
      .createQueryBuilder('p')
      .select('p.brokerId', 'brokerId')
      .addSelect('COUNT(p.id)', 'policyCount')
      .addSelect('COALESCE(SUM(p.grossPremium), 0)', 'gwp')
      .addSelect('COALESCE(SUM(p.brokerCommission), 0)', 'commission')
      .where('p.createdAt BETWEEN :from AND :to', { from: range.from, to: range.to })
      .andWhere("p.status NOT IN ('quotation','cancelled')")
      .andWhere('p.brokerId IS NOT NULL')
      .groupBy('p.brokerId')
      .orderBy('gwp', 'DESC')
      .getRawMany();

    const brokers = raw.map((r) => ({
      brokerId: r.brokerId,
      policyCount: parseInt(r.policyCount),
      gwp: parseFloat(r.gwp),
      commission: parseFloat(r.commission),
    }));

    return {
      brokers,
      total: {
        policies: brokers.reduce((s, b) => s + b.policyCount, 0),
        gwp: brokers.reduce((s, b) => s + b.gwp, 0),
        commission: brokers.reduce((s, b) => s + b.commission, 0),
      },
    };
  }
}
