import {
  Controller, Get, Query, UseGuards, ParseEnumPipe, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportingService } from './reporting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

function parseDateRange(from: string, to: string) {
  if (!from || !to) throw new BadRequestException('from and to date parameters are required');
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()))
    throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
  toDate.setHours(23, 59, 59, 999);
  return { from: fromDate, to: toDate };
}

@ApiTags('Reporting & Compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportingController {
  constructor(private readonly svc: ReportingService) {}

  // ── EXECUTIVE KPI ─────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Real-time executive KPI dashboard' })
  dashboard() {
    return this.svc.getExecutiveDashboard();
  }

  // ── MANAGEMENT REPORTS ────────────────────────────────────────────────────

  @Get('gwp')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Gross Written Premium report — by product, channel, month' })
  @ApiQuery({ name: 'from', example: '2026-01-01' })
  @ApiQuery({ name: 'to', example: '2026-06-30' })
  gwpReport(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.getGwpReport(parseDateRange(from, to));
  }

  @Get('claims')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.CLAIMS_OFFICER, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Claims ratio, settlement time, fraud analysis report' })
  claimsReport(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.getClaimsReport(parseDateRange(from, to));
  }

  @Get('outstanding-premiums')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Aged debtors — outstanding premium analysis' })
  outstandingPremiums() {
    return this.svc.getOutstandingPremiumsReport();
  }

  @Get('broker-performance')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Broker GWP contribution, commissions, conversion rates' })
  brokerPerformance(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.getBrokerPerformanceReport(parseDateRange(from, to));
  }

  // ── REGULATORY REPORTS ────────────────────────────────────────────────────

  @Get('regulatory/ipec')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.FINANCE)
  @ApiOperation({ summary: 'IPEC statutory return — premium income, claims, solvency margin' })
  @ApiQuery({ name: 'quarter', example: '2026-Q2', description: 'Format: YYYY-QN' })
  ipecReturn(@Query('quarter') quarter: string) {
    if (!quarter || !/^\d{4}-Q[1-4]$/.test(quarter)) {
      throw new BadRequestException('quarter must be in format YYYY-QN e.g. 2026-Q2');
    }
    return this.svc.getIpecReturn(quarter);
  }

  @Get('regulatory/fiu-aml')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'FIU AML/CTF report — high-value transactions, KYC non-compliance' })
  fiuAml(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.getFiuAmlReport(parseDateRange(from, to));
  }
}
