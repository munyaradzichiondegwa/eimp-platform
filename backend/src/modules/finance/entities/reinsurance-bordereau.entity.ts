import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, Index,
} from 'typeorm';

export enum BordereauStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  ACKNOWLEDGED = 'acknowledged',
  SETTLED = 'settled',
}

@Entity('reinsurance_bordereaux')
@Index(['treatyId', 'period'], { unique: true })
export class ReinsuranceBordereau {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  bordereauNumber: string;

  @Column()
  @Index()
  treatyId: string;

  @Column({ length: 7 })
  period: string;

  @Column({ type: 'jsonb' })
  premiumCessions: Array<{
    policyNumber: string;
    grossPremium: number;
    cededPremium: number;
    cedingCommission: number;
  }>;

  @Column({ type: 'jsonb' })
  claimRecoveries: Array<{
    claimNumber: string;
    grossClaimAmount: number;
    recoverableAmount: number;
  }>;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  totalCededPremium: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  totalCedingCommission: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  totalRecoveries: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  netDueToReinsurer: number;

  @Column({ type: 'enum', enum: BordereauStatus, default: BordereauStatus.DRAFT })
  status: BordereauStatus;

  @Column({ nullable: true })
  issuedAt: Date;

  @Column({ nullable: true })
  settledAt: Date;

  @Column({ nullable: true, length: 50 })
  settlementRef: string;

  @Column({ nullable: true })
  documentKey: string;

  @Column({ nullable: true, length: 36 })
  generatedById: string;

  @CreateDateColumn()
  createdAt: Date;
}
