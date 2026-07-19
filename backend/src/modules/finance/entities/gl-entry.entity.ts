import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { GlAccount } from './gl-account.entity';

export enum GlEntrySource {
  PREMIUM_RECEIPT = 'premium_receipt',
  CLAIM_RESERVE = 'claim_reserve',
  CLAIM_PAYMENT = 'claim_payment',
  COMMISSION_ACCRUAL = 'commission_accrual',
  COMMISSION_PAYMENT = 'commission_payment',
  BANK_RECONCILIATION = 'bank_reconciliation',
  MANUAL_JOURNAL = 'manual_journal',
  REINSURANCE_CESSION = 'reinsurance_cession',
  REINSURANCE_RECOVERY = 'reinsurance_recovery',
  DEPRECIATION = 'depreciation',
  TAX_PAYMENT = 'tax_payment',
  CURRENCY_REVALUATION = 'currency_revaluation',
  OPENING_BALANCE = 'opening_balance',
}

@Entity('gl_entries')
@Index(['accountId', 'postedAt'])
export class GlEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  @Index()
  journalRef: string;  // Groups related debit/credit entries

  @Column()
  accountId: string;

  @ManyToOne(() => GlAccount)
  @JoinColumn({ name: 'accountId' })
  account: GlAccount;

  @Column({ nullable: true, length: 20 })
  accountCode: string;  // Denormalised for reporting

  @Column({ nullable: true, length: 255 })
  accountName: string;  // Denormalised for reporting

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  debit: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  credit: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 12, scale: 6, default: 1 })
  fxRate: number;  // Rate to USD base currency

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  baseCurrencyDebit: number;  // USD equivalent

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  baseCurrencyCredit: number;

  @Column({ type: 'enum', enum: GlEntrySource })
  source: GlEntrySource;

  @Column({ nullable: true, length: 36 })
  sourceId: string;  // Policy ID, Claim ID, Invoice ID etc.

  @Column({ nullable: true, length: 50 })
  sourceRef: string;  // Human-readable ref (policy number etc.)

  @Column({ nullable: true, length: 500 })
  description: string;

  @Column({ nullable: true, length: 50 })
  costCentre: string;

  @Column({ nullable: true, length: 36 })
  postedById: string;

  @Column({ nullable: true, length: 100 })
  approvedById: string;

  @Column({ default: false })
  isReversed: boolean;

  @Column({ nullable: true, length: 36 })
  reversalOfEntryId: string;

  @Column({ nullable: true, length: 50 })
  period: string;  // e.g. 2026-06

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  // Immutable timestamp
  @CreateDateColumn()
  @Index()
  postedAt: Date;
}
