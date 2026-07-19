import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GlAccount, GlAccountType, GlAccountCategory } from './entities/gl-account.entity';
import { GlEntry, GlEntrySource } from './entities/gl-entry.entity';
import { Invoice, InvoiceStatus, InvoiceType } from './entities/invoice.entity';
import { Payment, PaymentChannel, PaymentStatus, PaymentType } from './entities/payment.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { v4 as uuidv4 } from 'uuid';

export interface JournalLine {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
  currency?: string;
  fxRate?: number;
}

export interface PostJournalDto {
  source: GlEntrySource;
  sourceId?: string;
  sourceRef?: string;
  description: string;
  lines: JournalLine[];
  currency?: string;
  period?: string;
}

export interface RecordPaymentDto {
  paymentType: PaymentType;
  channel: PaymentChannel;
  amount: number;
  currency: string;
  fxRate?: number;
  policyId?: string;
  invoiceId?: string;
  claimId?: string;
  customerId?: string;
  payerPhone?: string;
  payerAccountNumber?: string;
  payerName?: string;
  gatewayRef?: string;
  metadata?: Record<string, any>;
}

// Standard chart of accounts for insurance
const DEFAULT_ACCOUNTS = [
  { code: '1001', name: 'Cash on Hand', type: GlAccountType.ASSET, category: GlAccountCategory.CASH },
  { code: '1100', name: 'Bank Account — USD', type: GlAccountType.ASSET, category: GlAccountCategory.BANK },
  { code: '1110', name: 'Bank Account — ZiG', type: GlAccountType.ASSET, category: GlAccountCategory.BANK },
  { code: '1200', name: 'EcoCash Collections', type: GlAccountType.ASSET, category: GlAccountCategory.MOBILE_MONEY },
  { code: '1201', name: 'OneMoney Collections', type: GlAccountType.ASSET, category: GlAccountCategory.MOBILE_MONEY },
  { code: '1202', name: 'InnBucks Collections', type: GlAccountType.ASSET, category: GlAccountCategory.MOBILE_MONEY },
  { code: '1300', name: 'Premium Receivable', type: GlAccountType.ASSET, category: GlAccountCategory.PREMIUM_RECEIVABLE },
  { code: '1400', name: 'Reinsurance Recoverable', type: GlAccountType.ASSET, category: GlAccountCategory.REINSURANCE_RECOVERABLE },
  { code: '1500', name: 'Fixed Assets', type: GlAccountType.ASSET, category: GlAccountCategory.FIXED_ASSETS },
  { code: '1501', name: 'Accumulated Depreciation', type: GlAccountType.ASSET, category: GlAccountCategory.ACCUMULATED_DEPRECIATION },
  { code: '2100', name: 'Claims Payable', type: GlAccountType.LIABILITY, category: GlAccountCategory.CLAIMS_PAYABLE },
  { code: '2200', name: 'Claims Reserve', type: GlAccountType.LIABILITY, category: GlAccountCategory.CLAIMS_RESERVE },
  { code: '2300', name: 'Unearned Premium Reserve', type: GlAccountType.LIABILITY, category: GlAccountCategory.UNEARNED_PREMIUM },
  { code: '2400', name: 'Accounts Payable', type: GlAccountType.LIABILITY, category: GlAccountCategory.ACCOUNTS_PAYABLE },
  { code: '2500', name: 'Reinsurance Premium Payable', type: GlAccountType.LIABILITY, category: GlAccountCategory.REINSURANCE_PAYABLE },
  { code: '2600', name: 'VAT Payable', type: GlAccountType.LIABILITY, category: GlAccountCategory.TAX_PAYABLE },
  { code: '2601', name: 'Income Tax Payable', type: GlAccountType.LIABILITY, category: GlAccountCategory.TAX_PAYABLE },
  { code: '4001', name: 'Gross Written Premium — Credit Life', type: GlAccountType.REVENUE, category: GlAccountCategory.GROSS_WRITTEN_PREMIUM },
  { code: '4002', name: 'Gross Written Premium — Health', type: GlAccountType.REVENUE, category: GlAccountCategory.GROSS_WRITTEN_PREMIUM },
  { code: '4003', name: 'Gross Written Premium — Personal All Risks', type: GlAccountType.REVENUE, category: GlAccountCategory.GROSS_WRITTEN_PREMIUM },
  { code: '4004', name: 'Gross Written Premium — Agriculture', type: GlAccountType.REVENUE, category: GlAccountCategory.GROSS_WRITTEN_PREMIUM },
  { code: '4005', name: 'Gross Written Premium — Travel', type: GlAccountType.REVENUE, category: GlAccountCategory.GROSS_WRITTEN_PREMIUM },
  { code: '4100', name: 'Reinsurance Premium Ceded', type: GlAccountType.REVENUE, category: GlAccountCategory.REINSURANCE_PREMIUM },
  { code: '4200', name: 'Investment Income', type: GlAccountType.REVENUE, category: GlAccountCategory.INVESTMENT_INCOME },
  { code: '5001', name: 'Claims Incurred — Credit Life', type: GlAccountType.EXPENSE, category: GlAccountCategory.CLAIMS_INCURRED },
  { code: '5002', name: 'Claims Incurred — Health', type: GlAccountType.EXPENSE, category: GlAccountCategory.CLAIMS_INCURRED },
  { code: '5003', name: 'Claims Incurred — Personal All Risks', type: GlAccountType.EXPENSE, category: GlAccountCategory.CLAIMS_INCURRED },
  { code: '5100', name: 'Broker Commission Expense', type: GlAccountType.EXPENSE, category: GlAccountCategory.COMMISSION_EXPENSE },
  { code: '5200', name: 'Staff Costs', type: GlAccountType.EXPENSE, category: GlAccountCategory.MANAGEMENT_EXPENSE },
  { code: '5300', name: 'IT & Systems Expense', type: GlAccountType.EXPENSE, category: GlAccountCategory.OPERATING_EXPENSE },
  { code: '5400', name: 'Marketing & Distribution', type: GlAccountType.EXPENSE, category: GlAccountCategory.OPERATING_EXPENSE },
  { code: '5500', name: 'Regulatory & Compliance', type: GlAccountType.EXPENSE, category: GlAccountCategory.OPERATING_EXPENSE },
];

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(GlAccount)
    private glAccountRepo: Repository<GlAccount>,
    @InjectRepository(GlEntry)
    private glEntryRepo: Repository<GlEntry>,
    @InjectRepository(Invoice)
    private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    private auditService: AuditService,
  ) {}

  // ── CHART OF ACCOUNTS INITIALISATION ─────────────────────────────────────

  async seedChartOfAccounts(createdById: string): Promise<GlAccount[]> {
    const existing = await this.glAccountRepo.count();
    if (existing > 0) return this.glAccountRepo.find();

    const accounts = this.glAccountRepo.create(
      DEFAULT_ACCOUNTS.map((a) => ({
        ...a,
        isSystemAccount: true,
        currency: 'USD',
        createdById,
      })),
    );
    return this.glAccountRepo.save(accounts);
  }

  async getAccounts(type?: GlAccountType): Promise<GlAccount[]> {
    const where: any = { isActive: true };
    if (type) where.type = type;
    return this.glAccountRepo.find({ where, order: { code: 'ASC' } });
  }

  async getAccountByCode(code: string): Promise<GlAccount> {
    const account = await this.glAccountRepo.findOne({ where: { code } });
    if (!account) throw new NotFoundException(`GL account ${code} not found`);
    return account;
  }

  async createAccount(dto: Partial<GlAccount>, userId: string): Promise<GlAccount> {
    const account = this.glAccountRepo.create({ ...dto, createdById: userId });
    return this.glAccountRepo.save(account);
  }

  // ── JOURNAL POSTING ───────────────────────────────────────────────────────

  async postJournal(dto: PostJournalDto, postedById: string): Promise<GlEntry[]> {
    // Validate: debits must equal credits
    const totalDebits = dto.lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredits = dto.lines.reduce((s, l) => s + (l.credit || 0), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new BadRequestException(
        `Journal is unbalanced: debits ${totalDebits} ≠ credits ${totalCredits}`,
      );
    }

    const journalRef = `JNL-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
    const period = dto.period || new Date().toISOString().slice(0, 7);
    const baseCurrency = 'USD';

    const entries: GlEntry[] = [];
    for (const line of dto.lines) {
      const account = await this.getAccountByCode(line.accountCode);
      const fxRate = line.fxRate || 1;
      const currency = line.currency || dto.currency || 'USD';

      const entry = this.glEntryRepo.create({
        journalRef,
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        debit: line.debit || 0,
        credit: line.credit || 0,
        currency,
        fxRate,
        baseCurrencyDebit: ((line.debit || 0) / fxRate),
        baseCurrencyCredit: ((line.credit || 0) / fxRate),
        source: dto.source,
        sourceId: dto.sourceId,
        sourceRef: dto.sourceRef,
        description: line.description || dto.description,
        period,
        postedById,
      });

      entries.push(entry);

      // Update account running balance
      const balanceDelta = (line.debit || 0) - (line.credit || 0);
      const isDebitNormal = [GlAccountType.ASSET, GlAccountType.EXPENSE].includes(account.type);
      const balanceChange = isDebitNormal ? balanceDelta : -balanceDelta;
      await this.glAccountRepo.increment({ id: account.id }, 'currentBalance', balanceChange);
    }

    const saved = await this.glEntryRepo.save(entries);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'gl_journal',
      entityId: journalRef, entityRef: journalRef,
      userId: postedById, description: `Journal posted: ${dto.description}`, module: 'finance',
    });

    return saved;
  }

  // ── INVOICING ─────────────────────────────────────────────────────────────

  async createInvoice(data: {
    policyId: string;
    customerId: string;
    invoiceType: InvoiceType;
    netPremium: number;
    taxAmount: number;
    levyAmount: number;
    totalAmount: number;
    currency: string;
    dueDate: Date;
    lineItems?: any[];
    issuedById?: string;
  }): Promise<Invoice> {
    const count = await this.invoiceRepo.count();
    const invoiceNumber = `EBA-INV-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    const invoice = this.invoiceRepo.create({
      ...data,
      invoiceNumber,
      outstandingAmount: data.totalAmount,
      paidAmount: 0,
      status: InvoiceStatus.ISSUED,
    });

    const saved = await this.invoiceRepo.save(invoice);

    // Auto-post GL entries for AR
    await this.postJournal({
      source: GlEntrySource.PREMIUM_RECEIPT,
      sourceId: saved.id,
      sourceRef: invoiceNumber,
      description: `Premium invoice raised: ${invoiceNumber}`,
      currency: data.currency,
      lines: [
        { accountCode: '1300', debit: data.totalAmount, description: 'Premium receivable' },
        { accountCode: '4001', credit: data.netPremium, description: 'Gross written premium' },
        { accountCode: '2600', credit: data.taxAmount, description: 'VAT on premium' },
        ...(data.levyAmount > 0 ? [{ accountCode: '2600', credit: data.levyAmount, description: 'Insurance levy' }] : []),
      ],
    }, data.issuedById || 'system');

    return saved;
  }

  async findInvoices(options: {
    customerId?: string;
    policyId?: string;
    status?: InvoiceStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: Invoice[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const where: any = {};
    if (options.customerId) where.customerId = options.customerId;
    if (options.policyId) where.policyId = options.policyId;
    if (options.status) where.status = options.status;

    const [data, total] = await this.invoiceRepo.findAndCount({
      where, skip: (page - 1) * limit, take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total };
  }

  // ── PAYMENTS ──────────────────────────────────────────────────────────────

  async recordPayment(dto: RecordPaymentDto, processedById: string): Promise<Payment> {
    const count = await this.paymentRepo.count();
    const paymentRef = `EBA-PAY-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
    const fxRate = dto.fxRate || 1;

    const payment = this.paymentRepo.create({
      paymentRef,
      ...dto,
      fxRate,
      baseCurrencyAmount: dto.amount / fxRate,
      status: PaymentStatus.PENDING,
      processedById,
    });

    const saved = await this.paymentRepo.save(payment);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'payment',
      entityId: saved.id, entityRef: paymentRef,
      userId: processedById,
      description: `Payment recorded: ${paymentRef} — ${dto.currency} ${dto.amount} via ${dto.channel}`,
      module: 'finance',
    });

    return saved;
  }

  async confirmPayment(
    paymentId: string,
    gatewayRef: string,
    userId: string,
  ): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    payment.status = PaymentStatus.SUCCESS;
    payment.gatewayRef = gatewayRef;
    payment.confirmedAt = new Date();

    // If linked to invoice, mark as paid
    if (payment.invoiceId) {
      await this.applyPaymentToInvoice(payment.invoiceId, payment.amount);
    }

    // Post GL entry
    const channelAccountMap: Record<string, string> = {
      [PaymentChannel.ECOCASH]: '1200',
      [PaymentChannel.ONEMONEY]: '1201',
      [PaymentChannel.INNBUCKS]: '1202',
      [PaymentChannel.BANK_TRANSFER]: '1100',
      [PaymentChannel.RTGS]: '1100',
      [PaymentChannel.CARD]: '1100',
    };
    const cashAccount = channelAccountMap[payment.channel] || '1100';

    await this.postJournal({
      source: GlEntrySource.PREMIUM_RECEIPT,
      sourceId: payment.id,
      sourceRef: payment.paymentRef,
      description: `Premium payment received: ${payment.paymentRef}`,
      currency: payment.currency,
      lines: [
        { accountCode: cashAccount, debit: payment.amount, description: `Payment via ${payment.channel}` },
        { accountCode: '1300', credit: payment.amount, description: 'Premium receivable cleared' },
      ],
    }, userId);

    payment.glPosted = true;
    payment.glJournalRef = payment.paymentRef;
    const saved = await this.paymentRepo.save(payment);

    return saved;
  }

  async failPayment(paymentId: string, reason: string, userId: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    payment.status = PaymentStatus.FAILED;
    payment.failureReason = reason;
    return this.paymentRepo.save(payment);
  }

  // ── FINANCIAL STATEMENTS ──────────────────────────────────────────────────

  async getTrialBalance(period?: string): Promise<{
    accounts: Array<{ code: string; name: string; type: string; debit: number; credit: number; balance: number }>;
    totals: { debit: number; credit: number };
  }> {
    const qb = this.glEntryRepo
      .createQueryBuilder('e')
      .select('e.accountCode', 'code')
      .addSelect('e.accountName', 'name')
      .addSelect('SUM(e.debit)', 'totalDebit')
      .addSelect('SUM(e.credit)', 'totalCredit')
      .groupBy('e.accountCode, e.accountName');

    if (period) qb.where('e.period = :period', { period });
    const rows = await qb.getRawMany();

    const accounts = await Promise.all(
      rows.map(async (row) => {
        const account = await this.glAccountRepo.findOne({ where: { code: row.code } });
        const debit = parseFloat(row.totalDebit) || 0;
        const credit = parseFloat(row.totalCredit) || 0;
        const isDebitNormal = account &&
          [GlAccountType.ASSET, GlAccountType.EXPENSE].includes(account.type);
        const balance = isDebitNormal ? debit - credit : credit - debit;
        return { code: row.code, name: row.name, type: account?.type || '', debit, credit, balance };
      }),
    );

    accounts.sort((a, b) => a.code.localeCompare(b.code));
    const totals = {
      debit: accounts.reduce((s, a) => s + a.debit, 0),
      credit: accounts.reduce((s, a) => s + a.credit, 0),
    };

    return { accounts, totals };
  }

  async getProfitAndLoss(period?: string): Promise<{
    revenue: { accounts: any[]; total: number };
    expenses: { accounts: any[]; total: number };
    netIncome: number;
  }> {
    const accounts = await this.glAccountRepo.find({
      where: [{ type: GlAccountType.REVENUE }, { type: GlAccountType.EXPENSE }],
      order: { code: 'ASC' },
    });

    const revenue: any[] = [];
    const expenses: any[] = [];

    for (const account of accounts) {
      const qb = this.glEntryRepo
        .createQueryBuilder('e')
        .select('SUM(e.credit) - SUM(e.debit)', 'amount')
        .where('e.accountId = :id', { id: account.id });
      if (period) qb.andWhere('e.period LIKE :p', { p: `${period}%` });

      const result = await qb.getRawOne();
      const amount = parseFloat(result?.amount || '0');
      const item = { code: account.code, name: account.name, amount };

      if (account.type === GlAccountType.REVENUE) revenue.push(item);
      else expenses.push(item);
    }

    const totalRevenue = revenue.reduce((s, a) => s + a.amount, 0);
    const totalExpenses = expenses.reduce((s, a) => s + a.amount, 0);

    return {
      revenue: { accounts: revenue, total: totalRevenue },
      expenses: { accounts: expenses, total: totalExpenses },
      netIncome: totalRevenue - totalExpenses,
    };
  }

  async getBalanceSheet(): Promise<{
    assets: { accounts: any[]; total: number };
    liabilities: { accounts: any[]; total: number };
    equity: number;
  }> {
    const accountTypes = [GlAccountType.ASSET, GlAccountType.LIABILITY];
    const result: Record<string, any[]> = { asset: [], liability: [] };

    for (const type of accountTypes) {
      const accounts = await this.glAccountRepo.find({
        where: { type, isActive: true }, order: { code: 'ASC' },
      });

      for (const account of accounts) {
        result[type].push({
          code: account.code,
          name: account.name,
          balance: account.currentBalance,
        });
      }
    }

    const totalAssets = result.asset.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = result.liability.reduce((s, a) => s + a.balance, 0);

    return {
      assets: { accounts: result.asset, total: totalAssets },
      liabilities: { accounts: result.liability, total: totalLiabilities },
      equity: totalAssets - totalLiabilities,
    };
  }

  async getDashboardStats(): Promise<{
    totalGwp: number;
    totalClaimsPaid: number;
    outstandingPremiums: number;
    cashPosition: number;
    claimsRatio: number;
    byChannel: Record<string, number>;
  }> {
    const gwpResult = await this.glEntryRepo
      .createQueryBuilder('e')
      .select('SUM(e.credit)', 'total')
      .where("e.accountCode LIKE '4%'")
      .getRawOne();
    const totalGwp = parseFloat(gwpResult?.total || '0');

    const claimsResult = await this.glEntryRepo
      .createQueryBuilder('e')
      .select('SUM(e.debit)', 'total')
      .where("e.accountCode LIKE '5001%' OR e.accountCode LIKE '5002%' OR e.accountCode LIKE '5003%'")
      .getRawOne();
    const totalClaimsPaid = parseFloat(claimsResult?.total || '0');

    const arResult = await this.glAccountRepo.findOne({ where: { code: '1300' } });
    const outstandingPremiums = arResult?.currentBalance || 0;

    const cashAccounts = await this.glAccountRepo.find({
      where: [
        { category: GlAccountCategory.CASH },
        { category: GlAccountCategory.BANK },
        { category: GlAccountCategory.MOBILE_MONEY },
      ],
    });
    const cashPosition = cashAccounts.reduce((s, a) => s + a.currentBalance, 0);

    const claimsRatio = totalGwp > 0 ? (totalClaimsPaid / totalGwp) * 100 : 0;

    const channelBreakdown = await this.paymentRepo
      .createQueryBuilder('p')
      .select('p.channel', 'channel')
      .addSelect('SUM(p.amount)', 'total')
      .where("p.status = 'success'")
      .groupBy('p.channel')
      .getRawMany();

    const byChannel: Record<string, number> = {};
    for (const row of channelBreakdown) {
      byChannel[row.channel] = parseFloat(row.total || '0');
    }

    return { totalGwp, totalClaimsPaid, outstandingPremiums, cashPosition, claimsRatio, byChannel };
  }

  private async applyPaymentToInvoice(invoiceId: string, amount: number): Promise<void> {
    const invoice = await this.invoiceRepo.findOne({ where: { id: invoiceId } });
    if (!invoice) return;

    invoice.paidAmount = (invoice.paidAmount || 0) + amount;
    invoice.outstandingAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount);

    if (invoice.outstandingAmount <= 0.01) {
      invoice.status = InvoiceStatus.PAID;
      invoice.paidDate = new Date();
    } else if (invoice.paidAmount > 0) {
      invoice.status = InvoiceStatus.PARTIALLY_PAID;
    }

    await this.invoiceRepo.save(invoice);
  }
}
