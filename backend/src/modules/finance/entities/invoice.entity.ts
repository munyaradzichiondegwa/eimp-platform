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
import { Policy } from '../../underwriting/entities/policy.entity';
import { Customer } from '../../crm/entities/customer.entity';

export enum InvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
  WRITTEN_OFF = 'written_off',
}

export enum InvoiceType {
  NEW_BUSINESS = 'new_business',
  RENEWAL = 'renewal',
  ENDORSEMENT = 'endorsement',
  ADDITIONAL_PREMIUM = 'additional_premium',
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  @Index()
  invoiceNumber: string;  // EBA-INV-2026-000001

  @Column()
  policyId: string;

  @ManyToOne(() => Policy)
  @JoinColumn({ name: 'policyId' })
  policy: Policy;

  @Column()
  customerId: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({ type: 'enum', enum: InvoiceType, default: InvoiceType.NEW_BUSINESS })
  invoiceType: InvoiceType;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.ISSUED })
  @Index()
  status: InvoiceStatus;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  netPremium: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  levyAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  totalAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  outstandingAmount: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'date' })
  @Index()
  dueDate: Date;

  @Column({ nullable: true })
  paidDate: Date;

  @Column({ nullable: true })
  cancelledDate: Date;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ nullable: true, length: 36 })
  issuedById: string;

  @Column({ default: false })
  glPosted: boolean;

  @Column({ nullable: true })
  glPostedAt: Date;

  @Column({ nullable: true, length: 36 })
  glJournalRef: string;

  @Column({ nullable: true })
  sentToCustomerAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    totalAmount: number;
    taxRate?: number;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
