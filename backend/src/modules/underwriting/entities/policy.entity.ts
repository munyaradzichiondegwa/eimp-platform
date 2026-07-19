import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Customer } from '../../crm/entities/customer.entity';
import { Product } from './product.entity';

export enum PolicyStatus {
  QUOTATION = 'quotation',
  PENDING_PAYMENT = 'pending_payment',
  ACTIVE = 'active',
  LAPSED = 'lapsed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  RENEWED = 'renewed',
  SUSPENDED = 'suspended',
  CLAIMED = 'claimed',
}

export enum PolicyCurrency {
  USD = 'USD',
  ZIG = 'ZIG',
  ZAR = 'ZAR',
  GBP = 'GBP',
}

export enum UnderwritingDecision {
  AUTO_APPROVED = 'auto_approved',
  REFERRED = 'referred',
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
}

export enum DistributionChannel {
  DIRECT_STAFF = 'direct_staff',
  BROKER = 'broker',
  CUSTOMER_PORTAL = 'customer_portal',
  MOBILE_APP = 'mobile_app',
  WHATSAPP = 'whatsapp',
}

@Entity('policies')
export class Policy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  @Index()
  policyNumber: string;  // EBA-POL-2026-000001

  @Column()
  @Index()
  customerId: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column()
  productId: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'enum', enum: PolicyStatus, default: PolicyStatus.QUOTATION })
  @Index()
  status: PolicyStatus;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  sumInsured: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  annualPremium: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  netPremium: number;  // After discounts, before tax

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  levyAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  grossPremium: number;  // Net + Tax + Levy

  @Column({ type: 'enum', enum: PolicyCurrency, default: PolicyCurrency.USD })
  currency: PolicyCurrency;

  @Column({ nullable: true, type: 'date' })
  @Index()
  startDate: Date;

  @Column({ nullable: true, type: 'date' })
  @Index()
  endDate: Date;

  @Column({ nullable: true, type: 'date' })
  expiryDate: Date;

  @Column({ nullable: true })
  issueDate: Date;

  @Column({ nullable: true })
  cancellationDate: Date;

  @Column({ nullable: true, type: 'text' })
  cancellationReason: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  cancellationRefundAmount: number;

  // Underwriting
  @Column({ type: 'enum', enum: UnderwritingDecision, default: UnderwritingDecision.PENDING })
  underwritingDecision: UnderwritingDecision;

  @Column({ nullable: true, length: 36 })
  underwriterId: string;

  @Column({ nullable: true })
  underwritingDate: Date;

  @Column({ nullable: true, type: 'text' })
  underwritingNotes: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  riskScore: number;

  @Column({ type: 'jsonb', nullable: true })
  riskData: Record<string, any>;  // Product-specific risk inputs

  // Distribution
  @Column({ type: 'enum', enum: DistributionChannel, default: DistributionChannel.DIRECT_STAFF })
  distributionChannel: DistributionChannel;

  @Column({ nullable: true, length: 36 })
  brokerId: string;

  @Column({ nullable: true, length: 36 })
  agentId: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  brokerCommission: number;

  // Beneficiaries (stored as JSON for flexibility)
  @Column({ type: 'jsonb', nullable: true })
  beneficiaries: Array<{
    name: string;
    relationship: string;
    percentage: number;
    idNumber?: string;
    phone?: string;
  }>;

  // Renewal
  @Column({ nullable: true, length: 36 })
  renewedFromPolicyId: string;  // Previous policy if renewal

  @Column({ nullable: true, length: 36 })
  renewedToPolicyId: string;

  @Column({ default: 1 })
  renewalCount: number;

  // Document generation
  @Column({ nullable: true })
  scheduleDocumentKey: string;  // S3 key

  @Column({ nullable: true })
  certificateDocumentKey: string;

  @Column({ nullable: true })
  scheduleGeneratedAt: Date;

  // Payment
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  outstandingPremium: number;

  @Column({ nullable: true })
  lastPaymentDate: Date;

  @Column({ nullable: true })
  nextPaymentDueDate: Date;

  @Column({ nullable: true, length: 36 })
  createdById: string;

  @Column({ type: 'jsonb', nullable: true })
  coverageDetails: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  endorsementHistory: Array<Record<string, any>>;

  @Column({ default: 1 })
  version: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
