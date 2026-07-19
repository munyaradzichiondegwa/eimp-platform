import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum AssetCategory {
  IT_EQUIPMENT = 'it_equipment',
  OFFICE_FURNITURE = 'office_furniture',
  MOTOR_VEHICLE = 'motor_vehicle',
  BUILDING = 'building',
  LEASEHOLD_IMPROVEMENT = 'leasehold_improvement',
  OTHER = 'other',
}

export enum DepreciationMethod {
  STRAIGHT_LINE = 'straight_line',
  REDUCING_BALANCE = 'reducing_balance',
}

export enum AssetStatus {
  ACTIVE = 'active',
  DISPOSED = 'disposed',
  FULLY_DEPRECIATED = 'fully_depreciated',
  WRITTEN_OFF = 'written_off',
}

@Entity('fixed_assets')
export class FixedAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  @Index()
  assetCode: string;  // EBA-FA-000001

  @Column({ length: 255 })
  description: string;

  @Column({ type: 'enum', enum: AssetCategory })
  category: AssetCategory;

  @Column({ type: 'date' })
  acquisitionDate: Date;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  cost: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  residualValue: number;

  @Column({ type: 'int' })
  usefulLifeMonths: number;

  @Column({ type: 'enum', enum: DepreciationMethod, default: DepreciationMethod.STRAIGHT_LINE })
  depreciationMethod: DepreciationMethod;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  reducingBalanceRate: number;  // % per annum, only for reducing balance method

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  accumulatedDepreciation: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  netBookValue: number;  // cost - accumulatedDepreciation

  @Column({ type: 'enum', enum: AssetStatus, default: AssetStatus.ACTIVE })
  status: AssetStatus;

  @Column({ nullable: true, length: 100 })
  location: string;

  @Column({ nullable: true, length: 100 })
  custodian: string;  // Staff member responsible

  @Column({ nullable: true })
  lastDepreciationRunDate: Date;

  @Column({ nullable: true })
  disposalDate: Date;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  disposalProceeds: number;

  @Column({ nullable: true, type: 'text' })
  disposalNotes: string;

  @Column({ nullable: true, length: 36 })
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
