import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum TreatyType {
  QUOTA_SHARE = 'quota_share',
  SURPLUS = 'surplus',
  EXCESS_OF_LOSS = 'excess_of_loss',
  FACULTATIVE = 'facultative',
}

export enum TreatyStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  TERMINATED = 'terminated',
  DRAFT = 'draft',
}

@Entity('reinsurance_treaties')
export class ReinsuranceTreaty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  @Index()
  treatyRef: string;  // EBA-RI-2026-001

  @Column({ length: 200 })
  name: string;

  @Column({ length: 200 })
  reinsurerName: string;

  @Column({ nullable: true, length: 100 })
  reinsurerContact: string;

  @Column({ type: 'enum', enum: TreatyType })
  type: TreatyType;

  @Column({ type: 'enum', enum: TreatyStatus, default: TreatyStatus.DRAFT })
  status: TreatyStatus;

  @Column({ type: 'date' })
  effectiveDate: Date;

  @Column({ type: 'date' })
  expiryDate: Date;

  // Quota share terms
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  cessionPercentage: number;  // % of every risk ceded (quota share)

  // Surplus / Excess of Loss terms
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  retentionLimit: number;  // Insurer retains up to this (sum insured for surplus, claim amount for XoL)

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  maxCessionLimit: number;  // Maximum the treaty will accept above retention

  // Commission terms
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  cedingCommissionRate: number;  // % of ceded premium returned to insurer as commission

  // Flat premium allocation for XoL treaties (not proportional to individual policies)
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  flatAnnualPremium: number;

  @Column({ type: 'simple-array', nullable: true })
  applicableProductTypes: string[];  // Which product types this treaty covers; null = all

  @Column({ nullable: true, type: 'text' })
  terms: string;  // Free-text treaty wording reference

  @Column({ nullable: true, length: 36 })
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
