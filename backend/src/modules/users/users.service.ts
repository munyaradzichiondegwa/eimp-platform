import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsString, IsEnum, IsOptional, MinLength } from 'class-validator';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';

export class CreateUserDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEmail() email: string;
  @IsString() @MinLength(10) password: string;
  @IsEnum(UserRole) role: UserRole;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() department?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() department?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateUserDto, createdById: string): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException(`Email ${dto.email} is already registered`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = this.userRepository.create({
      ...dto,
      email: dto.email.toLowerCase(),
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: true, // Admin-provisioned accounts skip verification — the admin vouches for the email
    });

    const saved = await this.userRepository.save(user);

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'user',
      entityId: saved.id,
      entityRef: saved.email,
      userId: createdById,
      description: `Created user ${saved.email} with role ${saved.role}`,
      module: 'users',
      after: { email: saved.email, role: saved.role },
    });

    return saved;
  }

  async findAll(options?: {
    role?: UserRole;
    status?: UserStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: User[]; total: number }> {
    const { page = 1, limit = 20, role, status } = options || {};
    const where: any = {};
    if (role) where.role = role;
    if (status) where.status = status;

    const [data, total] = await this.userRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total };
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email: email.toLowerCase() } });
  }

  async update(id: string, dto: UpdateUserDto, updatedById: string): Promise<User> {
    const user = await this.findById(id);
    const before = { ...user };

    Object.assign(user, dto);
    const updated = await this.userRepository.save(user);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'user',
      entityId: id,
      entityRef: user.email,
      userId: updatedById,
      description: `Updated user ${user.email}`,
      before: { role: before.role, status: before.status },
      after: { role: updated.role, status: updated.status },
      module: 'users',
    });

    return updated;
  }

  async setStatus(id: string, status: UserStatus, changedById: string): Promise<User> {
    const user = await this.findById(id);
    const oldStatus = user.status;
    user.status = status;
    await this.userRepository.save(user);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'user',
      entityId: id,
      entityRef: user.email,
      userId: changedById,
      description: `User ${user.email} status changed: ${oldStatus} → ${status}`,
      module: 'users',
    });

    return user;
  }

  async count(): Promise<{ total: number; byRole: Record<string, number> }> {
    const total = await this.userRepository.count();
    const byRole: Record<string, number> = {};
    for (const role of Object.values(UserRole)) {
      byRole[role] = await this.userRepository.count({ where: { role } });
    }
    return { total, byRole };
  }
}
