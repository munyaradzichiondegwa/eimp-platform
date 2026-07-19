import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  LOGIN_FAILED = 'login_failed',
  PASSWORD_CHANGE = 'password_change',
  ROLE_CHANGE = 'role_change',
  APPROVE = 'approve',
  REJECT = 'reject',
  EXPORT = 'export',
  VIEW_SENSITIVE = 'view_sensitive',
  SYSTEM = 'system',
}

@Entity('audit_logs')
@Index(['entityType', 'entityId'])
@Index(['userId', 'performedAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ nullable: true, length: 100 })
  entityType: string;  // 'customer', 'policy', 'claim', etc.

  @Column({ nullable: true, length: 36 })
  entityId: string;

  @Column({ nullable: true, length: 100 })
  entityRef: string;  // Human-readable ref (policy number etc.)

  @Column({ nullable: true, length: 36 })
  @Index()
  userId: string;

  @Column({ nullable: true, length: 100 })
  userEmail: string;

  @Column({ nullable: true, length: 50 })
  userRole: string;

  @Column({ nullable: true, type: 'jsonb' })
  before: Record<string, any>;  // State before change

  @Column({ nullable: true, type: 'jsonb' })
  after: Record<string, any>;   // State after change

  @Column({ nullable: true, type: 'jsonb' })
  changes: Record<string, any>; // Only the changed fields

  @Column({ nullable: true, length: 500 })
  description: string;

  @Column({ nullable: true, length: 50 })
  ipAddress: string;

  @Column({ nullable: true, length: 500 })
  userAgent: string;

  @Column({ nullable: true, length: 100 })
  requestId: string;

  @Column({ nullable: true, length: 20 })
  module: string;  // 'crm', 'underwriting', 'claims', 'finance'

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  // Immutable - created once, never updated (enforced at DB level)
  @CreateDateColumn()
  @Index()
  performedAt: Date;
}
