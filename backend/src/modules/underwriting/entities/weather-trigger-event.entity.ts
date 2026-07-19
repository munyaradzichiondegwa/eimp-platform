import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum TriggerEventStatus {
  DETECTED = 'detected',          // Threshold breached, payouts being calculated
  PAYOUTS_CALCULATED = 'payouts_calculated',
  CLAIMS_CREATED = 'claims_created',
  SETTLED = 'settled',
  REVIEW_REQUIRED = 'review_required',  // Anomalous data, needs manual sign-off
}

@Entity('weather_trigger_events')
export class WeatherTriggerEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  @Index()
  eventRef: string;  // EBA-WX-2026-000001

  @Column({ length: 50 })
  stationId: string;

  @Column()
  @Index()
  productId: string;

  @Column({ type: 'date' })
  triggerDate: Date;  // Date the threshold was breached

  @Column({ type: 'date' })
  measurementPeriodStart: Date;

  @Column({ type: 'date' })
  measurementPeriodEnd: Date;

  @Column({ length: 50 })
  triggerType: string;  // drought, flood, temperature

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  measuredValue: number;  // The aggregated value that breached the threshold

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  thresholdValue: number;

  @Column({ length: 50 })
  payoutLevel: string;  // Matches a level in product.payoutSchedule

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  payoutPercentage: number;  // % of sum insured paid out at this level

  @Column({ type: 'enum', enum: TriggerEventStatus, default: TriggerEventStatus.DETECTED })
  @Index()
  status: TriggerEventStatus;

  @Column({ default: 0 })
  affectedPolicyCount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalPayoutAmount: number;

  @Column({ type: 'jsonb', nullable: true })
  affectedPolicyIds: string[];

  @Column({ type: 'jsonb', nullable: true })
  generatedClaimIds: string[];

  @Column({ nullable: true, length: 36 })
  reviewedById: string;

  @Column({ nullable: true })
  reviewedAt: Date;

  @Column({ nullable: true, type: 'text' })
  reviewNotes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
