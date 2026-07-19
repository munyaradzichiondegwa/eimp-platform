import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  IsString, IsEnum, IsOptional, IsNumber, IsDateString, IsUUID, IsArray,
} from 'class-validator';
import { Product, ProductStatus } from './entities/product.entity';
import { Policy, PolicyStatus, PolicyCurrency, DistributionChannel, UnderwritingDecision } from './entities/policy.entity';
import { PolicyEndorsement, EndorsementType, EndorsementStatus } from './entities/endorsement.entity';
import { Customer, KycStatus } from '../crm/entities/customer.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { RiskScoringService } from '../ai/risk-scoring.service';

export class CreateProductDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsString() type: string;
  premiumRules: any;
  coverageConfig: any;
  @IsOptional() underwritingRules?: any;
  @IsOptional() @IsNumber() brokerCommissionRate?: number;
}

export class QuotationDto {
  @IsUUID() productId: string;
  @IsUUID() customerId: string;
  @IsNumber() sumInsured: number;
  @IsEnum(PolicyCurrency) currency: PolicyCurrency;
  @IsDateString() startDate: string;
  @IsOptional() @IsNumber() termMonths?: number;
  @IsEnum(DistributionChannel) distributionChannel: DistributionChannel;
  @IsOptional() @IsString() brokerId?: string;
  @IsOptional() riskData?: Record<string, any>;
}

export class IssuePolicyDto extends QuotationDto {
  @IsOptional() beneficiaries?: any[];
  @IsOptional() coverageDetails?: Record<string, any>;
}

export class EndorseDto {
  @IsUUID() policyId: string;
  @IsEnum(EndorsementType) type: EndorsementType;
  @IsDateString() effectiveDate: string;
  newState: Record<string, any>;
  @IsOptional() @IsString() reason?: string;
}

const POLICY_SEQ_KEY = 'policy_seq';

@Injectable()
export class UnderwritingService {
  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Policy)
    private policyRepo: Repository<Policy>,
    @InjectRepository(PolicyEndorsement)
    private endorsementRepo: Repository<PolicyEndorsement>,
    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
    private auditService: AuditService,
    private riskScoringService: RiskScoringService,
  ) {}

  // ── PRODUCTS ─────────────────────────────────────────────────────────────

  async createProduct(dto: CreateProductDto, createdById: string): Promise<Product> {
    const existing = await this.productRepo.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Product code ${dto.code} already exists`);

    const product = this.productRepo.create({ ...(dto as any), createdById });
    const saved = await this.productRepo.save(product) as unknown as Product;

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'product',
      entityId: saved.id, entityRef: saved.code,
      userId: createdById, description: `Created product: ${saved.name}`, module: 'underwriting',
    });

    return saved;
  }

  async activateProduct(id: string, userId: string): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    product.status = ProductStatus.ACTIVE;
    product.activatedAt = new Date();
    product.lastModifiedById = userId;
    return this.productRepo.save(product);
  }

  async getProducts(activeOnly = false): Promise<Product[]> {
    const where: any = {};
    if (activeOnly) where.status = ProductStatus.ACTIVE;
    return this.productRepo.find({ where, order: { name: 'ASC' } });
  }

  async getProductById(id: string): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProduct(id: string, dto: Partial<CreateProductDto>, userId: string): Promise<Product> {
    const product = await this.getProductById(id);
    Object.assign(product, dto, { lastModifiedById: userId });
    return this.productRepo.save(product);
  }

  // ── QUOTATION ENGINE ──────────────────────────────────────────────────────

  async generateQuote(dto: QuotationDto): Promise<{
    productId: string;
    customerId: string;
    sumInsured: number;
    currency: string;
    termMonths: number;
    startDate: string;
    endDate: string;
    netPremium: number;
    taxAmount: number;
    levyAmount: number;
    grossPremium: number;
    annualPremium: number;
    breakdown: Record<string, any>;
    riskScore: number;
    riskBand: string;
    riskFactors: Array<{ name: string; impact: number; description: string }>;
    underwritingDecision: string;
  }> {
    const product = await this.getProductById(dto.productId);

    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Product is not active');
    }

    const rules = product.premiumRules;
    const coverageConfig = product.coverageConfig;
    const uwRules = product.underwritingRules || {};
    const termMonths = dto.termMonths || coverageConfig.policyTermMonths || 12;

    // Validate sum insured
    if (dto.sumInsured < coverageConfig.minSumInsured) {
      throw new BadRequestException(
        `Sum insured below minimum of ${coverageConfig.minSumInsured} ${coverageConfig.currency}`,
      );
    }
    if (dto.sumInsured > coverageConfig.maxSumInsured) {
      throw new BadRequestException(
        `Sum insured exceeds maximum of ${coverageConfig.maxSumInsured} ${coverageConfig.currency}`,
      );
    }

    // Calculate base premium from rate bands or flat rate
    let basePremium = 0;
    if (rules.premiumBands && rules.premiumBands.length > 0) {
      const band = rules.premiumBands.find(
        (b: any) => dto.sumInsured >= b.minSumInsured && dto.sumInsured <= b.maxSumInsured,
      );
      if (band) {
        basePremium = dto.sumInsured * (band.rate / 100);
      }
    } else if (rules.ratePerUnit) {
      basePremium = dto.sumInsured * (rules.ratePerUnit / 100);
    } else if (rules.basePremium) {
      basePremium = rules.basePremium;
    }

    // Pro-rate for term
    const termFactor = termMonths / 12;
    let netPremium = basePremium * termFactor;

    // Apply floor / ceiling
    if (rules.minPremium && netPremium < rules.minPremium * termFactor) {
      netPremium = rules.minPremium * termFactor;
    }
    if (rules.maxPremium && netPremium > rules.maxPremium * termFactor) {
      netPremium = rules.maxPremium * termFactor;
    }

    // Apply discounts (placeholder - conditions evaluated by rules engine)
    let discountAmount = 0;
    if (rules.discounts) {
      for (const discount of rules.discounts) {
        discountAmount += netPremium * (discount.percentage / 100);
      }
    }
    netPremium = netPremium - discountAmount;
    netPremium = Math.max(netPremium, 0);

    // Tax and levy
    const taxRate = rules.taxRate || 0;
    const levyRate = rules.levyRate || 0;
    const taxAmount = netPremium * (taxRate / 100);
    const levyAmount = netPremium * (levyRate / 100);
    const grossPremium = netPremium + taxAmount + levyAmount;
    const annualPremium = (grossPremium / termMonths) * 12;

    // Risk score via the dedicated statistical scoring engine — pulls real
    // claims history and policy count for this customer, plus actual age
    // (from date of birth) and live KYC status rather than relying on the
    // caller to supply risk inputs by hand.
    const customer = await this.customerRepo.findOne({ where: { id: dto.customerId } });
    const customerAge = customer?.dateOfBirth
      ? Math.floor((Date.now() - new Date(customer.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
      : dto.riskData?.age;

    const riskResult = await this.riskScoringService.scoreForCustomer({
      customerId: dto.customerId,
      productType: product.type,
      sumInsured: dto.sumInsured,
      maxSumInsuredForProduct: coverageConfig.maxSumInsured,
      customerAge,
      kycApproved: customer?.kycStatus === KycStatus.APPROVED,
      policyTermMonths: termMonths,
      distributionChannel: dto.distributionChannel,
    });
    const riskScore = riskResult.score;

    // Underwriting decision — honours product-level auto-approve/referral
    // thresholds on sum insured, then defers to the risk engine's own
    // recommendation (which already accounts for sum insured internally,
    // so this acts as a second, product-specific guardrail).
    let underwritingDecision = UnderwritingDecision.PENDING;
    if (riskResult.recommendation === 'decline') {
      underwritingDecision = UnderwritingDecision.REFERRED; // Declines always go through a human, never auto-rejected
    } else if (uwRules.referralThreshold && dto.sumInsured > uwRules.referralThreshold) {
      underwritingDecision = UnderwritingDecision.REFERRED;
    } else if (riskResult.recommendation === 'refer') {
      underwritingDecision = UnderwritingDecision.REFERRED;
    } else if (uwRules.autoApproveBelow && dto.sumInsured <= uwRules.autoApproveBelow) {
      underwritingDecision = UnderwritingDecision.AUTO_APPROVED;
    } else {
      underwritingDecision = UnderwritingDecision.AUTO_APPROVED;
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + termMonths);

    return {
      productId: dto.productId,
      customerId: dto.customerId,
      sumInsured: dto.sumInsured,
      currency: dto.currency,
      termMonths,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      netPremium: Math.round(netPremium * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      levyAmount: Math.round(levyAmount * 100) / 100,
      grossPremium: Math.round(grossPremium * 100) / 100,
      annualPremium: Math.round(annualPremium * 100) / 100,
      breakdown: { basePremium, discountAmount, termFactor, taxRate, levyRate },
      riskScore,
      riskBand: riskResult.band,
      riskFactors: riskResult.factors,
      underwritingDecision,
    };
  }

  // ── POLICY ISSUANCE ───────────────────────────────────────────────────────

  async issuePolicy(dto: IssuePolicyDto, issuedById: string): Promise<Policy> {
    const quote = await this.generateQuote(dto);
    const count = await this.policyRepo.count();
    const year = new Date().getFullYear();
    const policyNumber = `EBA-POL-${year}-${String(count + 1).padStart(6, '0')}`;

    const startDate = new Date(dto.startDate);
    const endDate = new Date(quote.endDate);

    const policy = this.policyRepo.create({
      policyNumber,
      customerId: dto.customerId,
      productId: dto.productId,
      status: quote.underwritingDecision === UnderwritingDecision.AUTO_APPROVED
        ? PolicyStatus.PENDING_PAYMENT
        : PolicyStatus.QUOTATION,
      sumInsured: dto.sumInsured,
      annualPremium: quote.annualPremium,
      netPremium: quote.netPremium,
      taxAmount: quote.taxAmount,
      levyAmount: quote.levyAmount,
      grossPremium: quote.grossPremium,
      currency: dto.currency,
      startDate,
      endDate,
      expiryDate: endDate,
      distributionChannel: dto.distributionChannel,
      brokerId: dto.brokerId,
      underwritingDecision: quote.underwritingDecision as UnderwritingDecision,
      riskScore: quote.riskScore,
      riskData: dto.riskData,
      beneficiaries: dto.beneficiaries,
      coverageDetails: dto.coverageDetails,
      outstandingPremium: quote.grossPremium,
      nextPaymentDueDate: startDate,
      createdById: issuedById,
    });

    // Calculate broker commission
    const product = await this.getProductById(dto.productId);
    if (dto.brokerId && product.brokerCommissionRate > 0) {
      policy.brokerCommission = quote.netPremium * (product.brokerCommissionRate / 100);
    }

    const saved = await this.policyRepo.save(policy);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'policy',
      entityId: saved.id, entityRef: saved.policyNumber,
      userId: issuedById, description: `Policy issued: ${saved.policyNumber}`, module: 'underwriting',
    });

    return saved;
  }

  async activatePolicy(policyId: string, userId: string): Promise<Policy> {
    const policy = await this.findPolicyById(policyId);
    if (policy.status !== PolicyStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Only policies pending payment can be activated');
    }
    policy.status = PolicyStatus.ACTIVE;
    policy.issueDate = new Date();
    policy.outstandingPremium = 0;
    const saved = await this.policyRepo.save(policy);

    await this.auditService.log({
      action: AuditAction.APPROVE, entityType: 'policy',
      entityId: policyId, entityRef: policy.policyNumber,
      userId, description: `Policy activated: ${policy.policyNumber}`, module: 'underwriting',
    });

    return saved;
  }

  async cancelPolicy(
    policyId: string, reason: string, userId: string,
  ): Promise<Policy> {
    const policy = await this.findPolicyById(policyId);
    if (![PolicyStatus.ACTIVE, PolicyStatus.PENDING_PAYMENT].includes(policy.status)) {
      throw new BadRequestException('Policy cannot be cancelled in its current state');
    }

    // Pro-rata refund calculation
    const today = new Date();
    const endDate = new Date(policy.endDate);
    const startDate = new Date(policy.startDate);
    const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const remainingDays = Math.max(0, (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const refundAmount = policy.status === PolicyStatus.ACTIVE
      ? Math.round((policy.netPremium * (remainingDays / totalDays)) * 100) / 100
      : policy.grossPremium;

    policy.status = PolicyStatus.CANCELLED;
    policy.cancellationDate = today;
    policy.cancellationReason = reason;
    policy.cancellationRefundAmount = refundAmount;
    const saved = await this.policyRepo.save(policy);

    await this.auditService.log({
      action: AuditAction.UPDATE, entityType: 'policy',
      entityId: policyId, entityRef: policy.policyNumber,
      userId, description: `Policy cancelled: ${policy.policyNumber}. Refund: ${refundAmount}`, module: 'underwriting',
    });

    return saved;
  }

  async renewPolicy(policyId: string, userId: string): Promise<Policy> {
    const original = await this.findPolicyById(policyId);
    if (original.status !== PolicyStatus.ACTIVE && original.status !== PolicyStatus.EXPIRED) {
      throw new BadRequestException('Only active or expired policies can be renewed');
    }

    const termMonths = original.endDate && original.startDate
      ? Math.round(
          (new Date(original.endDate).getTime() - new Date(original.startDate).getTime()) /
          (1000 * 60 * 60 * 24 * 30),
        )
      : 12;

    const newStartDate = new Date(original.endDate);
    newStartDate.setDate(newStartDate.getDate() + 1);
    const newEndDate = new Date(newStartDate);
    newEndDate.setMonth(newEndDate.getMonth() + termMonths);

    const count = await this.policyRepo.count();
    const year = new Date().getFullYear();
    const policyNumber = `EBA-POL-${year}-${String(count + 1).padStart(6, '0')}`;

    const renewal = this.policyRepo.create({
      ...original,
      id: undefined,
      policyNumber,
      status: PolicyStatus.PENDING_PAYMENT,
      startDate: newStartDate,
      endDate: newEndDate,
      expiryDate: newEndDate,
      issueDate: null,
      cancellationDate: null,
      cancellationReason: null,
      cancellationRefundAmount: null,
      renewedFromPolicyId: original.id,
      renewalCount: (original.renewalCount || 0) + 1,
      outstandingPremium: original.grossPremium,
      createdById: userId,
      version: 1,
    });

    const saved = await this.policyRepo.save(renewal);

    // Mark original as renewed
    await this.policyRepo.update(original.id, {
      status: PolicyStatus.RENEWED,
      renewedToPolicyId: saved.id,
    });

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'policy',
      entityId: saved.id, entityRef: saved.policyNumber,
      userId, description: `Policy renewed from ${original.policyNumber} → ${saved.policyNumber}`, module: 'underwriting',
    });

    return saved;
  }

  async createEndorsement(dto: EndorseDto, requestedById: string): Promise<PolicyEndorsement> {
    const policy = await this.findPolicyById(dto.policyId);
    if (policy.status !== PolicyStatus.ACTIVE) {
      throw new BadRequestException('Only active policies can be endorsed');
    }

    const count = await this.endorsementRepo.count();
    const endorsementNumber = `EBA-END-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const previousState: Record<string, any> = {};
    for (const key of Object.keys(dto.newState)) {
      previousState[key] = (policy as any)[key];
    }

    const endorsement = this.endorsementRepo.create({
      endorsementNumber,
      policyId: dto.policyId,
      type: dto.type,
      effectiveDate: new Date(dto.effectiveDate),
      previousState,
      newState: dto.newState,
      reason: dto.reason,
      requestedById,
      status: EndorsementStatus.PENDING_APPROVAL,
    });

    return this.endorsementRepo.save(endorsement);
  }

  async approveEndorsement(endorsementId: string, userId: string): Promise<PolicyEndorsement> {
    const endorsement = await this.endorsementRepo.findOne({ where: { id: endorsementId } });
    if (!endorsement) throw new NotFoundException('Endorsement not found');
    if (endorsement.status !== EndorsementStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Endorsement is not pending approval');
    }

    endorsement.status = EndorsementStatus.APPROVED;
    endorsement.approvedById = userId;
    endorsement.approvedAt = new Date();

    // Apply changes to policy
    const updates: Partial<Policy> = {};
    for (const [key, value] of Object.entries(endorsement.newState)) {
      (updates as any)[key] = value;
    }
    updates.version = (await this.findPolicyById(endorsement.policyId)).version + 1;
    await this.policyRepo.update(endorsement.policyId, updates);
    endorsement.status = EndorsementStatus.APPLIED;

    await this.auditService.log({
      action: AuditAction.APPROVE, entityType: 'endorsement',
      entityId: endorsementId, entityRef: endorsement.endorsementNumber,
      userId, description: `Endorsement applied: ${endorsement.endorsementNumber}`, module: 'underwriting',
    });

    return this.endorsementRepo.save(endorsement);
  }

  // ── QUERIES ───────────────────────────────────────────────────────────────

  async findPolicies(options: {
    customerId?: string;
    status?: PolicyStatus;
    productId?: string;
    brokerId?: string;
    search?: string;
    expiringDays?: number;
    page?: number;
    limit?: number;
  }): Promise<{ data: Policy[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const qb = this.policyRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.product', 'product')
      .leftJoinAndSelect('p.customer', 'customer');

    if (options.customerId) qb.andWhere('p.customerId = :cid', { cid: options.customerId });
    if (options.status) qb.andWhere('p.status = :status', { status: options.status });
    if (options.productId) qb.andWhere('p.productId = :pid', { pid: options.productId });
    if (options.brokerId) qb.andWhere('p.brokerId = :bid', { bid: options.brokerId });
    if (options.search) {
      qb.andWhere('(p.policyNumber ILIKE :s OR customer.email ILIKE :s)', { s: `%${options.search}%` });
    }
    if (options.expiringDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + options.expiringDays);
      qb.andWhere('p.endDate BETWEEN :now AND :cutoff', { now: new Date(), cutoff });
      qb.andWhere("p.status = 'active'");
    }

    qb.orderBy('p.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findPolicyById(id: string): Promise<Policy> {
    const policy = await this.policyRepo.findOne({
      where: { id },
      relations: ['product', 'customer'],
    });
    if (!policy) throw new NotFoundException(`Policy ${id} not found`);
    return policy;
  }

  async findPolicyByNumber(policyNumber: string): Promise<Policy> {
    const policy = await this.policyRepo.findOne({
      where: { policyNumber },
      relations: ['product', 'customer'],
    });
    if (!policy) throw new NotFoundException(`Policy ${policyNumber} not found`);
    return policy;
  }

  async getEndorsements(policyId: string): Promise<PolicyEndorsement[]> {
    return this.endorsementRepo.find({
      where: { policyId },
      order: { createdAt: 'DESC' },
    });
  }

  async getEndorsementById(id: string): Promise<PolicyEndorsement> {
    const endorsement = await this.endorsementRepo.findOne({ where: { id } });
    if (!endorsement) throw new NotFoundException(`Endorsement ${id} not found`);
    return endorsement;
  }

  // Stats for dashboard
  async getStats(): Promise<{
    totalPolicies: number;
    active: number;
    pendingPayment: number;
    expiringSoon: number;
    totalGwp: number;
    byProduct: Record<string, number>;
  }> {
    const totalPolicies = await this.policyRepo.count();
    const active = await this.policyRepo.count({ where: { status: PolicyStatus.ACTIVE } });
    const pendingPayment = await this.policyRepo.count({ where: { status: PolicyStatus.PENDING_PAYMENT } });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 30);
    const expiringSoon = await this.policyRepo
      .createQueryBuilder('p')
      .where('p.endDate BETWEEN :now AND :cutoff', { now: new Date(), cutoff })
      .andWhere("p.status = 'active'")
      .getCount();

    const gwpResult = await this.policyRepo
      .createQueryBuilder('p')
      .select('SUM(p.grossPremium)', 'total')
      .where("p.status NOT IN ('quotation', 'cancelled')")
      .getRawOne();
    const totalGwp = parseFloat(gwpResult?.total || '0');

    const byProductRaw = await this.policyRepo
      .createQueryBuilder('p')
      .leftJoin('p.product', 'prod')
      .select('prod.name', 'name')
      .addSelect('COUNT(p.id)', 'count')
      .where("p.status != 'quotation'")
      .groupBy('prod.name')
      .getRawMany();

    const byProduct: Record<string, number> = {};
    for (const row of byProductRaw) {
      byProduct[row.name || 'Unknown'] = parseInt(row.count);
    }

    return { totalPolicies, active, pendingPayment, expiringSoon, totalGwp, byProduct };
  }
}
