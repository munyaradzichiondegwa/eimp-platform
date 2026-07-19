import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PaymentChannel {
  ECOCASH = 'ecocash',
  ONEMONEY = 'onemoney',
  INNBUCKS = 'innbucks',
  BANK_TRANSFER = 'bank_transfer',
  RTGS = 'rtgs',
  ZIPIT = 'zipit',
  SWIFT = 'swift',
  CARD = 'card',
  CASH = 'cash',
}

export enum PaymentStatus {
  INITIATED = 'initiated',
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REVERSED = 'reversed',
  QUEUED = 'queued',     // Circuit breaker - queued for retry
  TIMED_OUT = 'timed_out',
}

export enum PaymentType {
  PREMIUM_COLLECTION = 'premium_collection',
  CLAIM_SETTLEMENT = 'claim_settlement',
  COMMISSION_PAYMENT = 'commission_payment',
  REFUND = 'refund',
  REINSURANCE_PREMIUM = 'reinsurance_premium',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 40 })
  @Index()
  paymentRef: string;  // EBA-PAY-2026-000001

  @Column({ type: 'enum', enum: PaymentType })
  paymentType: PaymentType;

  @Column({ type: 'enum', enum: PaymentChannel })
  channel: PaymentChannel;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.INITIATED })
  @Index()
  status: PaymentStatus;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 12, scale: 6, default: 1 })
  fxRate: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  baseCurrencyAmount: number;

  // Links to source records
  @Column({ nullable: true, length: 36 })
  policyId: string;

  @Column({ nullable: true, length: 36 })
  invoiceId: string;

  @Column({ nullable: true, length: 36 })
  claimId: string;

  @Column({ nullable: true, length: 36 })
  customerId: string;

  // Gateway details
  @Column({ nullable: true, length: 100 })
  @Index()
  gatewayRef: string;  // External gateway transaction ID

  @Column({ nullable: true, length: 100 })
  gatewayOrderId: string;

  @Column({ nullable: true, type: 'jsonb' })
  gatewayRequest: Record<string, any>;  // What we sent

  @Column({ nullable: true, type: 'jsonb' })
  gatewayResponse: Record<string, any>;  // What we received

  @Column({ nullable: true, length: 30 })
  payerPhone: string;  // Mobile money payer

  @Column({ nullable: true, length: 50 })
  payerAccountNumber: string;

  @Column({ nullable: true, length: 100 })
  payerName: string;

  // Confirmation
  @Column({ nullable: true })
  confirmedAt: Date;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true })
  nextRetryAt: Date;

  @Column({ nullable: true, type: 'text' })
  failureReason: string;

  // GL
  @Column({ default: false })
  glPosted: boolean;

  @Column({ nullable: true, length: 50 })
  glJournalRef: string;

  @Column({ nullable: true, length: 36 })
  processedById: string;  // Staff who processed (if manual)

  @Column({ nullable: true, length: 36 })
  reversalOfPaymentId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  @Index()
  initiatedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
