import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  PENDING_CUSTOMER = 'pending_customer',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  ESCALATED = 'escalated',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TicketCategory {
  POLICY_QUERY = 'policy_query',
  CLAIMS_QUERY = 'claims_query',
  PAYMENT_ISSUE = 'payment_issue',
  KYC_ISSUE = 'kyc_issue',
  PORTAL_ISSUE = 'portal_issue',
  COMPLAINT = 'complaint',
  GENERAL = 'general',
}

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 25 })
  @Index()
  ticketNumber: string;  // EBA-TKT-000001

  @Column()
  @Index()
  customerId: string;

  @Column({ length: 500 })
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  @Index()
  status: TicketStatus;

  @Column({ type: 'enum', enum: TicketPriority, default: TicketPriority.MEDIUM })
  priority: TicketPriority;

  @Column({ type: 'enum', enum: TicketCategory, default: TicketCategory.GENERAL })
  category: TicketCategory;

  @Column({ nullable: true, length: 36 })
  assignedToId: string;

  @Column({ nullable: true, length: 36 })
  policyId: string;

  @Column({ nullable: true, length: 36 })
  claimId: string;

  // SLA tracking
  @Column({ nullable: true })
  slaDeadline: Date;

  @Column({ nullable: true })
  resolvedAt: Date;

  @Column({ nullable: true })
  closedAt: Date;

  @Column({ nullable: true })
  escalatedAt: Date;

  @Column({ nullable: true, length: 36 })
  escalatedToId: string;

  @Column({ default: false })
  slaBreach: boolean;

  @Column({ nullable: true, type: 'text' })
  resolution: string;

  @Column({ type: 'jsonb', nullable: true })
  comments: Array<{
    authorId: string;
    authorName: string;
    body: string;
    createdAt: string;
    isInternal: boolean;
  }>;

  @Column({ nullable: true, length: 36 })
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
