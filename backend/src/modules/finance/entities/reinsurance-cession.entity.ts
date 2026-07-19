import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, Index,
} from 'typeorm';

@Entity('reinsurance_cessions')
@Index(['policyId', 'treatyId'], { unique: true })
export class ReinsuranceCession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  policyId: string;

  @Column({ length: 30 })
  policyNumber: string;  // Denormalised for bordereau reporting

  @Column()
  @Index()
  treatyId: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  grossSumInsured: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  cededSumInsured: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  retainedSumInsured: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  grossPremium: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  cededPremium: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  retainedPremium: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  cedingCommission: number;  // Commission earned back from reinsurer

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  cessionRatio: number;  // cededSumInsured / grossSumInsured

  @Column({ nullable: true, length: 7 })
  bordereauPeriod: string;  // YYYY-MM — set once included in a bordereau

  @Column({ default: false })
  glPosted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
