import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum CustomerType {
  INDIVIDUAL = 'individual',
  CORPORATE = 'corporate',
}

export enum KycStatus {
  NOT_SUBMITTED = 'not_submitted',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  RE_VERIFICATION_REQUIRED = 're_verification_required',
}

export enum CustomerSegment {
  RETAIL = 'retail',
  SME = 'sme',
  CORPORATE = 'corporate',
  BROKER_CLIENT = 'broker_client',
  MICRO = 'micro',
  AGRICULTURAL = 'agricultural',
}

export enum CustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DECEASED = 'deceased',
  BLACKLISTED = 'blacklisted',
}

@Entity('customers')
@Index(['idNumber'], { unique: true, where: '"idNumber" IS NOT NULL' })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty()
  id: string;

  @Column({ unique: true, length: 20 })
  @Index()
  customerNumber: string;  // Auto-generated: EBA-C-000001

  @Column({ type: 'enum', enum: CustomerType, default: CustomerType.INDIVIDUAL })
  @ApiProperty({ enum: CustomerType })
  type: CustomerType;

  // Individual fields
  @Column({ nullable: true, length: 100 })
  firstName: string;

  @Column({ nullable: true, length: 100 })
  lastName: string;

  @Column({ nullable: true, type: 'date' })
  dateOfBirth: Date;

  @Column({ nullable: true, length: 10 })
  gender: string;  // M, F, Other

  @Column({ nullable: true, length: 20 })
  @Index()
  idNumber: string;  // National ID

  @Column({ nullable: true, length: 20 })
  passportNumber: string;

  @Column({ nullable: true })
  passportExpiry: Date;

  // Corporate fields
  @Column({ nullable: true, length: 255 })
  companyName: string;

  @Column({ nullable: true, length: 50 })
  registrationNumber: string;

  @Column({ nullable: true, length: 50 })
  taxNumber: string;  // ZIMRA Tax Number

  @Column({ nullable: true, length: 100 })
  industryType: string;

  // Contact
  @Column({ length: 255 })
  @Index()
  email: string;

  @Column({ nullable: true, length: 20 })
  phone: string;

  @Column({ nullable: true, length: 20 })
  whatsappNumber: string;

  @Column({ nullable: true, length: 20 })
  alternatePhone: string;

  // Address
  @Column({ nullable: true, length: 255 })
  addressLine1: string;

  @Column({ nullable: true, length: 255 })
  addressLine2: string;

  @Column({ nullable: true, length: 100 })
  city: string;

  @Column({ nullable: true, length: 100 })
  province: string;

  @Column({ default: 'Zimbabwe', length: 100 })
  country: string;

  @Column({ nullable: true, length: 20 })
  postalCode: string;

  // Classification
  @Column({ type: 'enum', enum: CustomerSegment, default: CustomerSegment.RETAIL })
  segment: CustomerSegment;

  @Column({ type: 'enum', enum: CustomerStatus, default: CustomerStatus.ACTIVE })
  status: CustomerStatus;

  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.NOT_SUBMITTED })
  kycStatus: KycStatus;

  @Column({ nullable: true })
  kycApprovedAt: Date;

  @Column({ nullable: true })
  kycExpiryDate: Date;

  // AML/Compliance
  @Column({ default: false })
  isPep: boolean;  // Politically Exposed Person

  @Column({ default: false })
  isSanctioned: boolean;

  @Column({ nullable: true, length: 50 })
  riskRating: string;  // Low, Medium, High

  // Broker link (if broker-referred)
  @Column({ nullable: true })
  brokerId: string;

  // Self-service portal login link — set when customer self-registers
  // or when staff create portal access for an existing CRM record.
  @Column({ nullable: true, unique: true })
  @Index()
  userId: string;

  // Preferences
  @Column({ default: true })
  emailNotifications: boolean;

  @Column({ default: true })
  smsNotifications: boolean;

  @Column({ default: false })
  whatsappNotifications: boolean;

  @Column({ nullable: true, length: 10 })
  preferredLanguage: string;

  // Internal notes
  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ nullable: true, length: 36 })
  createdById: string;

  @Column({ nullable: true, length: 36 })
  assignedOfficerId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get fullName(): string {
    if (this.type === CustomerType.CORPORATE) return this.companyName;
    return `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }
}
