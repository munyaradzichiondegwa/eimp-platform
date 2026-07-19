import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction } from './entities/audit-log.entity';

export interface AuditLogDto {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  entityRef?: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  changes?: Record<string, any>;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  module?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
  ) {}

  async log(dto: AuditLogDto): Promise<void> {
    try {
      // Compute changes if both before and after are provided
      let changes = dto.changes;
      if (dto.before && dto.after && !changes) {
        changes = this.computeChanges(dto.before, dto.after);
      }

      const entry = this.auditRepository.create({
        ...dto,
        changes,
      });

      await this.auditRepository.save(entry);
    } catch (error) {
      // Audit failures must never break the main operation
      console.error('Audit log failed:', error);
    }
  }

  async findForEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    return this.auditRepository.find({
      where: { entityType, entityId },
      order: { performedAt: 'DESC' },
      take: 100,
    });
  }

  async findForUser(userId: string, limit = 50): Promise<AuditLog[]> {
    return this.auditRepository.find({
      where: { userId },
      order: { performedAt: 'DESC' },
      take: limit,
    });
  }

  async search(filters: {
    entityType?: string;
    action?: AuditAction;
    userId?: string;
    module?: string;
    fromDate?: Date;
    toDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ data: AuditLog[]; total: number }> {
    const { page = 1, limit = 50 } = filters;
    const qb = this.auditRepository.createQueryBuilder('log');

    if (filters.entityType) qb.andWhere('log.entityType = :et', { et: filters.entityType });
    if (filters.action) qb.andWhere('log.action = :action', { action: filters.action });
    if (filters.userId) qb.andWhere('log.userId = :userId', { userId: filters.userId });
    if (filters.module) qb.andWhere('log.module = :module', { module: filters.module });
    if (filters.fromDate) qb.andWhere('log.performedAt >= :from', { from: filters.fromDate });
    if (filters.toDate) qb.andWhere('log.performedAt <= :to', { to: filters.toDate });

    qb.orderBy('log.performedAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  private computeChanges(
    before: Record<string, any>,
    after: Record<string, any>,
  ): Record<string, any> {
    const changes: Record<string, any> = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }

    return changes;
  }
}
