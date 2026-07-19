import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum GlAccountType {
  ASSET = 'asset',
  LIABILITY = 'liability',
  EQUITY = 'equity',
  REVENUE = 'revenue',
  EXPENSE = 'expense',
}

export enum GlAccountCategory {
  // Assets
  CASH = 'cash',
  BANK = 'bank',
  MOBILE_MONEY = 'mobile_money',
  ACCOUNTS_RECEIVABLE = 'accounts_receivable',
  PREMIUM_RECEIVABLE = 'premium_receivable',
  REINSURANCE_RECOVERABLE = 'reinsurance_recoverable',
  FIXED_ASSETS = 'fixed_assets',
  ACCUMULATED_DEPRECIATION = 'accumulated_depreciation',
  INVESTMENT = 'investment',
  // Liabilities
  ACCOUNTS_PAYABLE = 'accounts_payable',
  CLAIMS_PAYABLE = 'claims_payable',
  CLAIMS_RESERVE = 'claims_reserve',
  UNEARNED_PREMIUM = 'unearned_premium',
  REINSURANCE_PAYABLE = 'reinsurance_payable',
  TAX_PAYABLE = 'tax_payable',
  // Revenue
  GROSS_WRITTEN_PREMIUM = 'gross_written_premium',
  REINSURANCE_PREMIUM = 'reinsurance_premium',
  INVESTMENT_INCOME = 'investment_income',
  // Expenses
  CLAIMS_INCURRED = 'claims_incurred',
  COMMISSION_EXPENSE = 'commission_expense',
  OPERATING_EXPENSE = 'operating_expense',
  MANAGEMENT_EXPENSE = 'management_expense',
}

@Entity('gl_accounts')
export class GlAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20 })
  @Index()
  code: string;  // e.g. 1100-001

  @Column({ length: 255 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: GlAccountType })
  type: GlAccountType;

  @Column({ type: 'enum', enum: GlAccountCategory })
  category: GlAccountCategory;

  @Column({ nullable: true, length: 20 })
  parentCode: string;  // For sub-accounts

  @Column({ nullable: true, length: 50 })
  costCentre: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isSystemAccount: boolean;  // Cannot be modified by users

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  currentBalance: number;

  @Column({ nullable: true, length: 10 })
  currency: string;  // Primary currency for this account

  @Column({ nullable: true, length: 36 })
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
