import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Lead, LeadStage, LeadSource } from './entities/lead.entity';
import {
  SupportTicket, TicketStatus, TicketPriority, TicketCategory,
} from './entities/support-ticket.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';

// ── SLA hours by priority ─────────────────────────────────────────────────────
const SLA_HOURS: Record<TicketPriority, number> = {
  [TicketPriority.URGENT]: 2,
  [TicketPriority.HIGH]: 8,
  [TicketPriority.MEDIUM]: 24,
  [TicketPriority.LOW]: 72,
};

@Injectable()
export class LeadTicketService {
  constructor(
    @InjectRepository(Lead)
    private leadRepo: Repository<Lead>,
    @InjectRepository(SupportTicket)
    private ticketRepo: Repository<SupportTicket>,
    private auditService: AuditService,
  ) {}

  // ── LEADS ─────────────────────────────────────────────────────────────────

  async createLead(data: Partial<Lead>, createdById: string): Promise<Lead> {
    const count = await this.leadRepo.count();
    const lead = this.leadRepo.create({
      ...data,
      leadNumber: `EBA-LEAD-${String(count + 1).padStart(6, '0')}`,
      stage: LeadStage.NEW,
      createdById,
    });
    const saved = await this.leadRepo.save(lead);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'lead',
      entityId: saved.id, entityRef: saved.leadNumber,
      userId: createdById, module: 'crm',
      description: `Lead created: ${saved.leadNumber} — ${saved.email}`,
    });

    return saved;
  }

  async updateLeadStage(
    id: string, stage: LeadStage, userId: string, notes?: string,
  ): Promise<Lead> {
    const lead = await this.leadRepo.findOne({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');

    const oldStage = lead.stage;
    lead.stage = stage;
    if (notes) lead.notes = notes;
    if (stage === LeadStage.CONVERTED) lead.convertedAt = new Date();

    const saved = await this.leadRepo.save(lead);

    await this.auditService.log({
      action: AuditAction.UPDATE, entityType: 'lead',
      entityId: id, entityRef: lead.leadNumber,
      userId, module: 'crm',
      description: `Lead stage: ${oldStage} → ${stage}`,
    });

    return saved;
  }

  async findLeads(options: {
    stage?: LeadStage;
    assignedToId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Lead[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const qb = this.leadRepo.createQueryBuilder('l');

    if (options.stage) qb.andWhere('l.stage = :stage', { stage: options.stage });
    if (options.assignedToId) {
      qb.andWhere('l.assignedToId = :aid', { aid: options.assignedToId });
    }
    if (options.search) {
      qb.andWhere(
        '(l.email ILIKE :s OR l.firstName ILIKE :s OR l.lastName ILIKE :s OR l.leadNumber ILIKE :s)',
        { s: `%${options.search}%` },
      );
    }

    qb.orderBy('l.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getLeadConversionStats(): Promise<{
    total: number;
    byStage: Record<string, number>;
    conversionRate: number;
  }> {
    const total = await this.leadRepo.count();
    const byStage: Record<string, number> = {};
    for (const stage of Object.values(LeadStage)) {
      byStage[stage] = await this.leadRepo.count({ where: { stage } });
    }
    const converted = byStage[LeadStage.CONVERTED] || 0;
    const conversionRate = total > 0 ? (converted / total) * 100 : 0;
    return { total, byStage, conversionRate };
  }

  // ── SUPPORT TICKETS ───────────────────────────────────────────────────────

  async createTicket(data: {
    customerId: string;
    subject: string;
    description: string;
    priority?: TicketPriority;
    category?: TicketCategory;
    policyId?: string;
    claimId?: string;
  }, createdById: string): Promise<SupportTicket> {
    const count = await this.ticketRepo.count();
    const priority = data.priority || TicketPriority.MEDIUM;

    // Calculate SLA deadline
    const slaDeadline = new Date();
    slaDeadline.setHours(slaDeadline.getHours() + SLA_HOURS[priority]);

    const ticket = this.ticketRepo.create({
      ...data,
      ticketNumber: `EBA-TKT-${String(count + 1).padStart(6, '0')}`,
      priority,
      status: TicketStatus.OPEN,
      slaDeadline,
      comments: [],
      createdById,
    });

    const saved = await this.ticketRepo.save(ticket);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'support_ticket',
      entityId: saved.id, entityRef: saved.ticketNumber,
      userId: createdById, module: 'crm',
      description: `Ticket created: ${saved.ticketNumber} — ${saved.subject}`,
    });

    return saved;
  }

  async addComment(
    ticketId: string,
    body: string,
    authorId: string,
    authorName: string,
    isInternal = false,
  ): Promise<SupportTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    ticket.comments = [
      ...(ticket.comments || []),
      { authorId, authorName, body, createdAt: new Date().toISOString(), isInternal },
    ];

    // Move to in_progress on first staff response
    if (ticket.status === TicketStatus.OPEN && !isInternal) {
      ticket.status = TicketStatus.IN_PROGRESS;
    }

    return this.ticketRepo.save(ticket);
  }

  async updateTicketStatus(
    ticketId: string,
    status: TicketStatus,
    userId: string,
    resolution?: string,
  ): Promise<SupportTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    ticket.status = status;
    if (status === TicketStatus.RESOLVED) {
      ticket.resolvedAt = new Date();
      if (resolution) ticket.resolution = resolution;
    }
    if (status === TicketStatus.CLOSED) ticket.closedAt = new Date();

    const saved = await this.ticketRepo.save(ticket);

    await this.auditService.log({
      action: AuditAction.UPDATE, entityType: 'support_ticket',
      entityId: ticketId, entityRef: ticket.ticketNumber,
      userId, module: 'crm',
      description: `Ticket ${ticket.ticketNumber} → ${status}`,
    });

    return saved;
  }

  async findTickets(options: {
    status?: TicketStatus;
    customerId?: string;
    priority?: TicketPriority;
    slaBreached?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ data: SupportTicket[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const qb = this.ticketRepo.createQueryBuilder('t');

    if (options.status) qb.andWhere('t.status = :status', { status: options.status });
    if (options.customerId) qb.andWhere('t.customerId = :cid', { cid: options.customerId });
    if (options.priority) qb.andWhere('t.priority = :p', { p: options.priority });
    if (options.slaBreached !== undefined) {
      qb.andWhere('t.slaBreach = :sb', { sb: options.slaBreached });
    }

    qb.orderBy('t.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getTicketStats(): Promise<{
    open: number; inProgress: number; resolved: number;
    slaBreached: number; byPriority: Record<string, number>;
  }> {
    const [open, inProgress, resolved, slaBreached] = await Promise.all([
      this.ticketRepo.count({ where: { status: TicketStatus.OPEN } }),
      this.ticketRepo.count({ where: { status: TicketStatus.IN_PROGRESS } }),
      this.ticketRepo.count({ where: { status: TicketStatus.RESOLVED } }),
      this.ticketRepo.count({ where: { slaBreach: true } }),
    ]);

    const byPriority: Record<string, number> = {};
    for (const p of Object.values(TicketPriority)) {
      byPriority[p] = await this.ticketRepo.count({ where: { priority: p } });
    }

    return { open, inProgress, resolved, slaBreached, byPriority };
  }

  // ── SCHEDULED: Check SLA breaches every 15 minutes ───────────────────────

  @Cron('*/15 * * * *')
  async checkSlaBreach(): Promise<void> {
    const now = new Date();
    await this.ticketRepo
      .createQueryBuilder()
      .update(SupportTicket)
      .set({ slaBreach: true })
      .where('slaDeadline < :now', { now })
      .andWhere("status NOT IN ('resolved','closed')")
      .andWhere('slaBreach = false')
      .execute();

    // Auto-escalate URGENT tickets that breach SLA
    const urgentBreached = await this.ticketRepo.find({
      where: { priority: TicketPriority.URGENT, slaBreach: true, status: TicketStatus.IN_PROGRESS },
    });

    for (const ticket of urgentBreached) {
      ticket.status = TicketStatus.ESCALATED;
      ticket.escalatedAt = new Date();
      await this.ticketRepo.save(ticket);
    }
  }
}
