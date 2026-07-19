import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum LeadStage {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  QUOTED = 'quoted',
  CONVERTED = 'converted',
  LOST = 'lost',
}

export enum LeadSource {
  WALK_IN = 'walk_in',
  REFERRAL = 'referral',
  BROKER = 'broker',
  WEBSITE = 'website',
  SOCIAL_MEDIA = 'social_media',
  COLD_CALL = 'cold_call',
  CAMPAIGN = 'campaign',
  OTHER = 'other',
}

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  @Index()
  leadNumber: string;  // EBA-LEAD-000001

  @Column({ length: 100, nullable: true })
  firstName: string;

  @Column({ length: 100, nullable: true })
  lastName: string;

  @Column({ length: 255, nullable: true })
  companyName: string;

  @Column({ length: 255 })
  @Index()
  email: string;

  @Column({ nullable: true, length: 20 })
  phone: string;

  @Column({ type: 'enum', enum: LeadStage, default: LeadStage.NEW })
  @Index()
  stage: LeadStage;

  @Column({ type: 'enum', enum: LeadSource, default: LeadSource.OTHER })
  source: LeadSource;

  @Column({ nullable: true, length: 100 })
  productInterest: string;

  @Column({ nullable: true, type: 'decimal', precision: 18, scale: 2 })
  estimatedPremium: number;

  @Column({ nullable: true, length: 36 })
  assignedToId: string;

  @Column({ nullable: true, length: 36 })
  brokerId: string;

  @Column({ nullable: true, length: 36 })
  convertedCustomerId: string;

  @Column({ nullable: true })
  convertedAt: Date;

  @Column({ nullable: true })
  nextFollowUpDate: Date;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ nullable: true, type: 'text' })
  lostReason: string;

  @Column({ nullable: true, length: 36 })
  createdById: string;

  @Column({ nullable: true, length: 100 })
  campaignRef: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
