import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WeatherIndexService, IngestReadingDto } from './weather-index.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { TriggerEventStatus } from './entities/weather-trigger-event.entity';

@ApiTags('Underwriting — Weather Index (Agriculture)')
@Controller('underwriting/weather')
export class WeatherIndexController {
  constructor(private readonly svc: WeatherIndexService) {}

  // ── INGESTION ─────────────────────────────────────────────────────────────
  // Public + HMAC-verifiable in production if the weather provider pushes data
  // via webhook; otherwise staff can ingest manually through the admin portal.

  @Post('readings')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'UW-08: Manually ingest a single weather reading' })
  ingest(@Body() dto: IngestReadingDto) {
    return this.svc.ingestReading(dto);
  }

  @Post('readings/batch')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'UW-08: Bulk ingest weather readings (e.g. backfill or CSV import)' })
  ingestBatch(@Body() readings: IngestReadingDto[]) {
    return this.svc.ingestBatch(readings);
  }

  @Post('webhook/ingest')
  @Public()
  @ApiOperation({ summary: 'Webhook endpoint for weather provider push integration' })
  webhookIngest(@Body() dto: IngestReadingDto) {
    return this.svc.ingestReading(dto);
  }

  @Get('readings')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get historical readings for a station within a date range' })
  getReadings(
    @Query('stationId') stationId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const toDate = to ? new Date(to) : new Date();
    return this.svc.getReadings(stationId, fromDate, toDate);
  }

  // ── TRIGGER DETECTION ─────────────────────────────────────────────────────

  @Post('check-triggers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Manually run threshold check across all active agriculture products' })
  checkTriggers() {
    return this.svc.checkAllTriggers();
  }

  @Get('events')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'List weather trigger events with status filter' })
  findEvents(
    @Query('status') status?: TriggerEventStatus,
    @Query('productId') productId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.findEvents({ status, productId, page: parseInt(page), limit: parseInt(limit) });
  }

  @Get('events/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get a single trigger event with full payout detail' })
  findEvent(@Param('id') id: string) {
    return this.svc.findEventById(id);
  }

  @Post('events/:id/process-payouts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Manually trigger payout processing for a detected event (creates auto-claims)' })
  processPayouts(@Param('id') id: string) {
    return this.svc.processPayouts(id);
  }

  @Patch('events/:id/approve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Approve a flagged event (anomalous data) and proceed with payouts' })
  approveEvent(
    @Param('id') id: string,
    @Body('notes') notes: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.approveReviewedEvent(id, user.id, notes);
  }

  @Patch('events/:id/reject')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Reject a flagged event — no payout will be processed' })
  rejectEvent(
    @Param('id') id: string,
    @Body('notes') notes: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.rejectReviewedEvent(id, user.id, notes);
  }
}
