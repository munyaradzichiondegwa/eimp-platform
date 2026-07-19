import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ProductType {
  CREDIT_LIFE = 'credit_life',
  HEALTH = 'health',
  PERSONAL_ALL_RISKS = 'personal_all_risks',
  AGRICULTURE_WEATHER_INDEX = 'agriculture_weather_index',
  TRAVEL = 'travel',
}

export enum ProductStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DISCONTINUED = 'discontinued',
}

export enum ProductPhase {
  PHASE_1 = 'phase_1',
  PHASE_2 = 'phase_2',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  @Index()
  code: string;  // e.g. CREDIT-LIFE-001

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: ProductType })
  type: ProductType;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Column({ type: 'enum', enum: ProductPhase, default: ProductPhase.PHASE_1 })
  phase: ProductPhase;

  // Premium rules (JSON config — no code deployment needed)
  @Column({ type: 'jsonb' })
  premiumRules: {
    basePremium?: number;
    ratePerUnit?: number;
    minPremium?: number;
    maxPremium?: number;
    premiumBands?: Array<{ minSumInsured: number; maxSumInsured: number; rate: number }>;
    discounts?: Array<{ name: string; percentage: number; condition: string }>;
    loadings?: Array<{ name: string; percentage: number; condition: string }>;
    taxRate?: number;  // % e.g. 15 for 15% VAT
    levyRate?: number;
  };

  // Coverage config
  @Column({ type: 'jsonb' })
  coverageConfig: {
    minSumInsured: number;
    maxSumInsured: number;
    currency: string;
    waitingPeriodDays?: number;
    policyTermMonths?: number;
    minPolicyTermMonths?: number;
    maxPolicyTermMonths?: number;
    exclusions?: string[];
    coverageItems?: Array<{ name: string; included: boolean; sublimit?: number }>;
    benefitTypes?: string[];
  };

  // Underwriting rules
  @Column({ type: 'jsonb', nullable: true })
  underwritingRules: {
    minAge?: number;
    maxAge?: number;
    requiresMedical?: boolean;
    medicalThreshold?: number;
    autoApproveBelow?: number;
    referralThreshold?: number;
    declineRules?: Array<{ condition: string; reason: string }>;
    requiredDocuments?: string[];
  };

  // Weather index config (agriculture product)
  @Column({ type: 'jsonb', nullable: true })
  weatherIndexConfig: {
    stationId?: string;
    triggerType?: string;  // drought, flood, temperature
    triggerThreshold?: number;
    payoutSchedule?: Array<{ level: string; payout: number }>;
    measurementPeriod?: string;
  };

  // Distribution
  @Column({ type: 'simple-array', nullable: true })
  allowedDistributionChannels: string[];  // direct, broker, portal, mobile

  @Column({ default: true })
  isBrokerSellable: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  brokerCommissionRate: number;  // %

  @Column({ default: true })
  isPortalSellable: boolean;

  @Column({ nullable: true, length: 36 })
  createdById: string;

  @Column({ nullable: true, length: 36 })
  lastModifiedById: string;

  @Column({ nullable: true })
  activatedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  ipecDetails: {
    classOfBusiness?: string;
    licenseRef?: string;
    approvalRef?: string;
    approvedAt?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
