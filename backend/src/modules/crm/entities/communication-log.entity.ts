import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Customer } from './customer.entity';

export enum CommunicationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  PHONE_CALL = 'phone_call',
  IN_PERSON = 'in_person',
  PORTAL_MESSAGE = 'portal_message',
  PUSH_NOTIFICATION = 'push_notification',
}

export enum CommunicationDirection {
  OUTBOUND = 'outbound',  // System/staff to customer
  INBOUND = 'inbound',    // Customer to system/staff
}

export enum CommunicationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  BOUNCED = 'bounced',
}

export enum CommunicationPurpose {
  POLICY_RENEWAL_REMINDER = 'policy_renewal_reminder',
  PAYMENT_RECEIPT = 'payment_receipt',
  PAYMENT_REMINDER = 'payment_reminder',
  POLICY_ISSUED = 'policy_issued',
  CLAIM_ACKNOWLEDGEMENT = 'claim_acknowledgement',
  CLAIM_UPDATE = 'claim_update',
  CLAIM_SETTLED = 'claim_settled',
  KYC_REMINDER = 'kyc_reminder',
  KYC_APPROVED = 'kyc_approved',
  KYC_REJECTED = 'kyc_rejected',
  OTP = 'otp',
  GENERAL = 'general',
  MARKETING = 'marketing',
  WELCOME = 'welcome',
  PASSWORD_RESET = 'password_reset',
  ENDORSEMENT = 'endorsement',
  CANCELLATION = 'cancellation',
}

@Entity('communication_logs')
export class CommunicationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({ type: 'enum', enum: CommunicationChannel })
  channel: CommunicationChannel;

  @Column({ type: 'enum', enum: CommunicationDirection, default: CommunicationDirection.OUTBOUND })
  direction: CommunicationDirection;

  @Column({ type: 'enum', enum: CommunicationPurpose, default: CommunicationPurpose.GENERAL })
  purpose: CommunicationPurpose;

  @Column({ nullable: true, length: 500 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  body: string;

  @Column({ nullable: true, length: 20 })
  recipient: string;  // Phone or email

  @Column({ type: 'enum', enum: CommunicationStatus, default: CommunicationStatus.PENDING })
  status: CommunicationStatus;

  @Column({ nullable: true, length: 100 })
  externalMessageId: string;  // Gateway message ID

  @Column({ nullable: true })
  deliveredAt: Date;

  @Column({ nullable: true })
  readAt: Date;

  @Column({ nullable: true, type: 'text' })
  errorMessage: string;

  @Column({ nullable: true, length: 36 })
  sentById: string;  // User ID or 'system'

  @Column({ nullable: true })
  policyId: string;

  @Column({ nullable: true })
  claimId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  @Index()
  sentAt: Date;
}
