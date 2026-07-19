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

export enum ClaimStatus {
  FNOL_SUBMITTED = 'fnol_submitted',
  REGISTERED = 'registered',
  UNDER_ASSESSMENT = 'under_assessment',
  PENDING_DOCUMENTS = 'pending_documents',
  REFERRED_TO_SENIOR = 'referred_to_senior',
  APPROVED = 'approved',
  PARTIALLY_APPROVED = 'partially_approved',
  REJECTED = 'rejected',
  SETTLEMENT_PROCESSING = 'settlement_processing',
  SETTLED = 'settled',
  CLOSED = 'closed',
  WITHDRAWN = 'withdrawn',
  FRAUD_INVESTIGATION = 'fraud_investigation',
}

export enum ClaimType {
  DEATH = 'death',
  PERMANENT_DISABILITY = 'permanent_disability',
  TEMPORARY_DISABILITY = 'temporary_disability',
  MEDICAL_INPATIENT = 'medical_inpatient',
  MEDICAL_OUTPATIENT = 'medical_outpatient',
  PROPERTY_LOSS = 'property_loss',
  PROPERTY_DAMAGE = 'property_damage',
  WEATHER_TRIGGER = 'weather_trigger',
  TRAVEL_CANCELLATION = 'travel_cancellation',
  MEDICAL_EVACUATION = 'medical_evacuation',
  BAGGAGE_LOSS = 'baggage_loss',
}

export enum ClaimChannel {
  WEB_PORTAL = 'web_portal',
  MOBILE_APP = 'mobile_app',
  CALL_CENTRE = 'call_centre',
  BROKER_PORTAL = 'broker_portal',
  WALK_IN = 'walk_in',
  EMAIL = 'email',
  SYSTEM_AUTOMATED = 'system_automated',  // Parametric triggers (weather index)
}

@Entity('claims')
export class Claim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  @Index()
  claimNumber: string;  // EBA-CLM-2026-000001

  @Column()
  @Index()
  policyId: string;

  @ManyToOne(() => Policy)
  @JoinColumn({ name: 'policyId' })
  policy: Policy;

  @Column()
  @Index()
  customerId: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({ type: 'enum', enum: ClaimStatus, default: ClaimStatus.FNOL_SUBMITTED })
  @Index()
  status: ClaimStatus;

  @Column({ type: 'enum', enum: ClaimType })
  claimType: ClaimType;

  @Column({ type: 'enum', enum: ClaimChannel, default: ClaimChannel.WEB_PORTAL })
  channel: ClaimChannel;

  @Column({ type: 'date' })
  eventDate: Date;  // Date the insured event occurred

  @Column({ nullable: true, type: 'text' })
  eventDescription: string;

  @Column({ nullable: true, length: 255 })
  eventLocation: string;

  // Financial
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  claimedAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  reserveAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  approvedAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  settlementAmount: number;

  @Column({ nullable: true, length: 10 })
  currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  excess: number;  // Deductible applied

  // Fraud detection
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  fraudScore: number;  // 0-100

  @Column({ default: false })
  fraudFlagged: boolean;

  @Column({ nullable: true, type: 'text' })
  fraudFlags: string;  // JSON array of triggered rules

  @Column({ default: false })
  duplicateDetected: boolean;

  // Workflow
  @Column({ nullable: true, length: 36 })
  assignedToId: string;

  @Column({ nullable: true, length: 36 })
  assessedById: string;

  @Column({ nullable: true })
  assessmentDate: Date;

  @Column({ nullable: true, type: 'text' })
  assessmentNotes: string;

  @Column({ nullable: true, length: 36 })
  approvedById: string;

  @Column({ nullable: true })
  approvalDate: Date;

  @Column({ nullable: true, type: 'text' })
  rejectionReason: string;

  // Settlement
  @Column({ nullable: true })
  settlementDate: Date;

  @Column({ nullable: true, length: 50 })
  settlementPaymentRef: string;

  @Column({ nullable: true, length: 20 })
  settlementPaymentChannel: string;

  @Column({ nullable: true, length: 100 })
  settlementAccountNumber: string;

  // GL posting status
  @Column({ default: false })
  reserveGlPosted: boolean;

  @Column({ default: false })
  settlementGlPosted: boolean;

  // Third party involvement
  @Column({ nullable: true, type: 'jsonb' })
  thirdPartyDetails: Record<string, any>;

  // Hospital / Service provider (health claims)
  @Column({ nullable: true, type: 'jsonb' })
  serviceProviderDetails: Record<string, any>;

  @Column({ nullable: true, length: 36 })
  submittedById: string;  // Could be customer, broker, or staff

  @Column({ nullable: true })
  acknowledgedAt: Date;

  // SLA tracking
  @Column({ nullable: true })
  slaTargetDate: Date;

  @Column({ nullable: true })
  slaBreachedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  statusHistory: Array<{
    status: string;
    changedAt: string;
    changedById: string;
    notes?: string;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  fnolDate: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
