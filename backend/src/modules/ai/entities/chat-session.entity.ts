import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum ChatRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

export interface ChatMessageRecord {
  role: ChatRole;
  content: string;
  toolCalls?: Array<{ name: string; input: any; result: any }>;
  timestamp: string;
}

export enum ChatSessionStatus {
  ACTIVE = 'active',
  ENDED = 'ended',
  ESCALATED = 'escalated',  // Handed off to a human support ticket
}

@Entity('chat_sessions')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  customerId: string;

  @Column({ nullable: true, length: 36 })
  userId: string;  // Platform login that started the session

  @Column({ type: 'enum', enum: ChatSessionStatus, default: ChatSessionStatus.ACTIVE })
  status: ChatSessionStatus;

  @Column({ type: 'jsonb', default: [] })
  messages: ChatMessageRecord[];

  @Column({ nullable: true, length: 36 })
  escalatedToTicketId: string;

  @Column({ default: 0 })
  messageCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
