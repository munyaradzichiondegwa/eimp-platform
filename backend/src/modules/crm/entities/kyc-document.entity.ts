import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Customer } from './customer.entity';

export enum KycDocumentType {
  NATIONAL_ID = 'national_id',
  PASSPORT = 'passport',
  DRIVERS_LICENSE = 'drivers_license',
  UTILITY_BILL = 'utility_bill',
  BANK_STATEMENT = 'bank_statement',
  COMPANY_CERT = 'company_certificate',
  TAX_CLEARANCE = 'tax_clearance',
  PROOF_OF_ADDRESS = 'proof_of_address',
  DIRECTORS_LIST = 'directors_list',
  CR14 = 'cr14',  // Zimbabwe company form
}

export enum KycDocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

@Entity('kyc_documents')
export class KycDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({ type: 'enum', enum: KycDocumentType })
  documentType: KycDocumentType;

  @Column({ nullable: true, length: 100 })
  documentNumber: string;

  @Column()
  fileKey: string;  // S3 key

  @Column({ nullable: true, length: 500 })
  fileUrl: string;  // Signed URL (transient)

  @Column({ nullable: true, length: 10 })
  fileExtension: string;

  @Column({ nullable: true })
  fileSizeBytes: number;

  @Column({ type: 'enum', enum: KycDocumentStatus, default: KycDocumentStatus.PENDING })
  status: KycDocumentStatus;

  @Column({ nullable: true })
  expiryDate: Date;

  @Column({ nullable: true })
  reviewedAt: Date;

  @Column({ nullable: true, length: 36 })
  reviewedById: string;

  @Column({ nullable: true, type: 'text' })
  rejectionReason: string;

  @Column({ default: false })
  isVirusScanned: boolean;

  @Column({ default: false })
  virusFlagged: boolean;

  @Column({ default: 1 })
  version: number;

  @CreateDateColumn()
  uploadedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
