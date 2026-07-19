import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { Policy } from './policy.entity';

export enum EndorsementType {
  SUM_INSURED_INCREASE = 'sum_insured_increase',
  SUM_INSURED_DECREASE = 'sum_insured_decrease',
  BENEFICIARY_CHANGE = 'beneficiary_change',
  ADDRESS_CHANGE = 'address_change',
  COVERAGE_EXTENSION = 'coverage_extension',
  COVERAGE_REDUCTION = 'coverage_reduction',
  REINSTATEMENT = 'reinstatement',
  CORRECTION = 'correction',
  OTHER = 'other',
}

export enum EndorsementStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  APPLIED = 'applied',
}

@Entity('policy_endorsements')
export class PolicyEndorsement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  endorsementNumber: string;

  @Column()
  @Index()
  policyId: string;

  @ManyToOne(() => Policy)
  @JoinColumn({ name: 'policyId' })
  policy: Policy;

  @Column({ type: 'enum', enum: EndorsementType })
  type: EndorsementType;

  @Column({ type: 'enum', enum: EndorsementStatus, default: EndorsementStatus.DRAFT })
  status: EndorsementStatus;

  @Column({ type: 'date' })
  effectiveDate: Date;

  @Column({ type: 'jsonb' })
  previousState: Record<string, any>;

  @Column({ type: 'jsonb' })
  newState: Record<string, any>;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  additionalPremium: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  premiumRefund: number;

  @Column({ nullable: true, type: 'text' })
  reason: string;

  @Column({ nullable: true, length: 36 })
  requestedById: string;

  @Column({ nullable: true, length: 36 })
  approvedById: string;

  @Column({ nullable: true })
  approvedAt: Date;

  @Column({ nullable: true })
  documentKey: string;

  @CreateDateColumn()
  createdAt: Date;
}
