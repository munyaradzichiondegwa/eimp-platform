import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum BrokerStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated',
  PENDING_ACCREDITATION = 'pending_accreditation',
}

export enum BrokerType {
  INDIVIDUAL_AGENT = 'individual_agent',
  CORPORATE_BROKER = 'corporate_broker',
  BANCASSURANCE = 'bancassurance',
}

@Entity('brokers')
export class Broker {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  @Index()
  brokerCode: string;  // EBA-BRK-000001

  @Column({ length: 200 })
  name: string;  // Individual name or brokerage company name

  @Column({ type: 'enum', enum: BrokerType, default: BrokerType.INDIVIDUAL_AGENT })
  type: BrokerType;

  @Column({ length: 255 })
  @Index()
  email: string;

  @Column({ length: 20 })
  phone: string;

  @Column({ nullable: true, length: 50 })
  ipecLicenseNumber: string;  // IPEC broker/agent license

  @Column({ nullable: true })
  licenseExpiryDate: Date;

  @Column({ type: 'enum', enum: BrokerStatus, default: BrokerStatus.PENDING_ACCREDITATION })
  status: BrokerStatus;

  @Column({ nullable: true, length: 36 })
  userId: string;  // Linked platform login (User with role=broker), if they have portal access

  @Column({ nullable: true, length: 255 })
  bankAccountDetails: string;  // For commission payout — encrypted at app layer

  @Column({ nullable: true, length: 20 })
  mobileMoneyNumber: string;  // For commission payout via EcoCash etc.

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  defaultCommissionRate: number;  // % override, falls back to product rate if 0

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalCommissionEarned: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalCommissionPaid: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  outstandingCommission: number;

  @Column({ nullable: true })
  accreditedAt: Date;

  @Column({ nullable: true, length: 36 })
  accreditedById: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
