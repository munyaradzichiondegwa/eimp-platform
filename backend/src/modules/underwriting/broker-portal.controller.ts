import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BrokerPortalService, CreateBrokerDto } from './broker-portal.service';
import { UnderwritingService } from './underwriting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { BrokerStatus } from './entities/broker.entity';

@ApiTags('Broker & Agent Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('brokers')
export class BrokerPortalController {
  constructor(
    private readonly svc: BrokerPortalService,
    private readonly underwritingSvc: UnderwritingService,
  ) {}

  // ── ACCREDITATION (Admin/Underwriter only) ────────────────────────────────

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Register a new broker / agent for accreditation' })
  create(@Body() dto: CreateBrokerDto, @CurrentUser() user: User) {
    return this.svc.createBroker(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List and search brokers' })
  findAll(
    @Query('status') status?: BrokerStatus,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.findBrokers({ status, search, page: parseInt(page), limit: parseInt(limit) });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get broker profile by ID' })
  findOne(@Param('id') id: string) {
    return this.svc.findBrokerById(id);
  }

  @Patch(':id/accredit')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Accredit broker — activates portal access and selling rights' })
  accredit(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.accreditBroker(id, user.id);
  }

  @Patch(':id/suspend')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Suspend broker — blocks new business submission' })
  suspend(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: User) {
    return this.svc.suspendBroker(id, reason, user.id);
  }

  // ── BAP-01: NEW BUSINESS SUBMISSION ───────────────────────────────────────
  // Reuses the underwriting quote+issue engine; broker just supplies brokerId

  @Post(':id/quote')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BROKER, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'BAP-01: Generate quote on behalf of a client' })
  async quoteForClient(@Param('id') brokerId: string, @Body() body: any) {
    const broker = await this.svc.findBrokerById(brokerId);
    if (broker.status !== 'active') {
      throw new BadRequestException('Broker is not accredited — cannot submit new business');
    }
    return this.underwritingSvc.generateQuote({ ...body, brokerId });
  }

  @Post(':id/bind')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BROKER, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'BAP-01: Bind policy for client without requiring client self-registration' })
  async bindForClient(@Param('id') brokerId: string, @Body() body: any, @CurrentUser() user: User) {
    const broker = await this.svc.findBrokerById(brokerId);
    if (broker.status !== 'active') {
      throw new BadRequestException('Broker is not accredited — cannot bind policies');
    }
    return this.underwritingSvc.issuePolicy({ ...body, brokerId }, user.id);
  }

  // ── BAP-02: CLIENT PORTFOLIO VIEW ─────────────────────────────────────────

  @Get(':id/portfolio')
  @ApiOperation({ summary: 'BAP-02: Client portfolio — all policies, renewals due, claims status' })
  portfolio(@Param('id') brokerId: string) {
    return this.svc.getClientPortfolio(brokerId);
  }

  // ── BAP-03: COMMISSION STATEMENTS ─────────────────────────────────────────

  @Post(':id/statements/generate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Generate monthly commission statement (format: YYYY-MM)' })
  generateStatement(
    @Param('id') brokerId: string,
    @Body('period') period: string,
    @CurrentUser() user: User,
  ) {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('period must be in format YYYY-MM');
    }
    return this.svc.generateMonthlyStatement(brokerId, period, user.id);
  }

  @Get(':id/statements')
  @ApiOperation({ summary: 'BAP-03: List commission statements for download' })
  getStatements(@Param('id') brokerId: string) {
    return this.svc.getStatements(brokerId);
  }

  @Patch('statements/:statementId/query')
  @ApiOperation({ summary: 'Raise a query against a commission statement' })
  queryStatement(
    @Param('statementId') id: string,
    @Body('notes') notes: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.queryStatement(id, notes, user.id);
  }

  @Patch('statements/:statementId/mark-paid')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Mark commission statement as paid' })
  markPaid(
    @Param('statementId') id: string,
    @Body('paymentRef') paymentRef: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.markStatementPaid(id, paymentRef, user.id);
  }

  // ── BAP-04: PERFORMANCE REPORTING ─────────────────────────────────────────

  @Get(':id/performance')
  @ApiOperation({ summary: 'BAP-04: GWP contribution, conversion, renewal retention' })
  performance(
    @Param('id') brokerId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const toDate = to ? new Date(to) : new Date();
    return this.svc.getPerformanceReport(brokerId, fromDate, toDate);
  }
}
