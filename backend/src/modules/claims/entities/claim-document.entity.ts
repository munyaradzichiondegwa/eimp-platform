import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Claim } from './claim.entity';

export enum ClaimDocumentType {
  DEATH_CERTIFICATE = 'death_certificate',
  MEDICAL_CERTIFICATE = 'medical_certificate',
  POLICE_REPORT = 'police_report',
  HOSPITAL_INVOICE = 'hospital_invoice',
  ASSESSOR_REPORT = 'assessor_report',
  PHOTO_EVIDENCE = 'photo_evidence',
  ID_DOCUMENT = 'id_document',
  CLAIM_FORM = 'claim_form',
  SUPPORTING_AFFIDAVIT = 'supporting_affidavit',
  WEATHER_DATA = 'weather_data',
  PRESCRIPTION = 'prescription',
  LAB_RESULTS = 'lab_results',
  OTHER = 'other',
}

@Entity('claim_documents')
export class ClaimDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  claimId: string;

  @ManyToOne(() => Claim, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'claimId' })
  claim: Claim;

  @Column({ type: 'enum', enum: ClaimDocumentType })
  documentType: ClaimDocumentType;

  @Column({ nullable: true, length: 255 })
  originalFilename: string;

  @Column()
  fileKey: string;

  @Column({ nullable: true, length: 10 })
  fileExtension: string;

  @Column({ nullable: true })
  fileSizeBytes: number;

  @Column({ default: false })
  isVirusScanned: boolean;

  @Column({ default: false })
  virusFlagged: boolean;

  @Column({ nullable: true, length: 36 })
  uploadedById: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ default: 1 })
  version: number;

  @CreateDateColumn()
  uploadedAt: Date;
}
