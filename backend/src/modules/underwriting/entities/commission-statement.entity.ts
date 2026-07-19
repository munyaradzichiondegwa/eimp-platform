import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, Index,
} from 'typeorm';

export enum CommissionStatementStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  QUERIED = 'queried',
  PAID = 'paid',
}

@Entity('commission_statements')
@Index(['brokerId', 'period'], { unique: true })
export class CommissionStatement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  statementNumber: string;  // EBA-COM-2026-06-BRK001

  @Column()
  @Index()
  brokerId: string;

  @Column({ length: 7 })
  period: string;  // YYYY-MM

  @Column({ type: 'jsonb' })
  lineItems: Array<{
    policyNumber: string;
    productName: string;
    grossPremium: number;
    commissionRate: number;
    commissionAmount: number;
    transactionType: string;  // new_business, renewal, endorsement
  }>;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  totalCommission: number;

  @Column({ type: 'enum', enum: CommissionStatementStatus, default: CommissionStatementStatus.ISSUED })
  status: CommissionStatementStatus;

  @Column({ nullable: true, type: 'text' })
  queryNotes: string;

  @Column({ nullable: true })
  paidAt: Date;

  @Column({ nullable: true, length: 50 })
  paymentRef: string;

  @Column({ nullable: true })
  documentKey: string;  // S3 key for PDF statement

  @CreateDateColumn()
  createdAt: Date;
}
