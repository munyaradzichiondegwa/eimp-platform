import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService, PostJournalDto, RecordPaymentDto } from './finance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { GlAccountType } from './entities/gl-account.entity';
import { InvoiceStatus } from './entities/invoice.entity';

@ApiTags('Finance & Accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  // ── CHART OF ACCOUNTS ─────────────────────────────────────────────────────

  @Post('accounts/seed')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Seed default insurance chart of accounts (run once)' })
  seedAccounts(@CurrentUser() user: User) {
    return this.svc.seedChartOfAccounts(user.id);
  }

  @Get('accounts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'List chart of accounts' })
  getAccounts(@Query('type') type?: GlAccountType) {
    return this.svc.getAccounts(type);
  }

  @Post('accounts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Create a new GL account' })
  createAccount(@Body() dto: any, @CurrentUser() user: User) {
    return this.svc.createAccount(dto, user.id);
  }

  // ── JOURNALS ──────────────────────────────────────────────────────────────

  @Post('journals')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Post a manual double-entry journal' })
  postJournal(@Body() dto: PostJournalDto, @CurrentUser() user: User) {
    return this.svc.postJournal(dto, user.id);
  }

  // ── INVOICES ──────────────────────────────────────────────────────────────

  @Get('invoices')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'List invoices with filters' })
  findInvoices(
    @Query('customerId') customerId?: string,
    @Query('policyId') policyId?: string,
    @Query('status') status?: InvoiceStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.findInvoices({
      customerId, policyId, status, page: parseInt(page), limit: parseInt(limit),
    });
  }

  // ── PAYMENTS ──────────────────────────────────────────────────────────────

  @Post('payments')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Record an incoming or outgoing payment' })
  recordPayment(@Body() dto: RecordPaymentDto, @CurrentUser() user: User) {
    return this.svc.recordPayment(dto, user.id);
  }

  @Patch('payments/:id/confirm')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Confirm payment success from gateway callback' })
  confirmPayment(
    @Param('id') id: string,
    @Body('gatewayRef') gatewayRef: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.confirmPayment(id, gatewayRef, user.id);
  }

  @Patch('payments/:id/fail')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Mark payment as failed' })
  failPayment(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.failPayment(id, reason, user.id);
  }

  // ── FINANCIAL STATEMENTS ──────────────────────────────────────────────────

  @Get('statements/trial-balance')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Generate trial balance for a period (YYYY-MM)' })
  trialBalance(@Query('period') period?: string) {
    return this.svc.getTrialBalance(period);
  }

  @Get('statements/pnl')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Profit & Loss statement' })
  profitAndLoss(@Query('period') period?: string) {
    return this.svc.getProfitAndLoss(period);
  }

  @Get('statements/balance-sheet')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Balance sheet as at today' })
  balanceSheet() {
    return this.svc.getBalanceSheet();
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Finance KPI dashboard — GWP, claims ratio, cash position' })
  dashboard() {
    return this.svc.getDashboardStats();
  }
}
