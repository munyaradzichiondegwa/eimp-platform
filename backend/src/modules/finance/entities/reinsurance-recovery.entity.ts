import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum RecoveryStatus {
  PENDING = 'pending',
  CLAIMED_FROM_REINSURER = 'claimed_from_reinsurer',
  RECEIVED = 'received',
  DISPUTED = 'disputed',
}

@Entity('reinsurance_recoveries')
export class ReinsuranceRecovery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  claimId: string;

  @Column({ length: 30 })
  claimNumber: string;

  @Column()
  @Index()
  treatyId: string;

  @Column({ nullable: true })
  cessionId: string;  // Linked cession record, where applicable (quota share/surplus)

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  grossClaimAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  recoverableAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  recoveredAmount: number;

  @Column({ type: 'enum', enum: RecoveryStatus, default: RecoveryStatus.PENDING })
  @Index()
  status: RecoveryStatus;

  @Column({ nullable: true })
  claimedAt: Date;

  @Column({ nullable: true })
  receivedAt: Date;

  @Column({ nullable: true, length: 7 })
  bordereauPeriod: string;

  @Column({ default: false })
  glPosted: boolean;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
