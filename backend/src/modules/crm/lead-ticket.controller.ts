import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeadTicketService } from './lead-ticket.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { LeadStage } from './entities/lead.entity';
import { TicketStatus, TicketPriority, TicketCategory } from './entities/support-ticket.entity';

@ApiTags('CRM — Leads & Support Tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm')
export class LeadTicketController {

  constructor(private readonly svc: LeadTicketService) {}

  // ── LEADS ─────────────────────────────────────────────────────────────────

  @Post('leads')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER, UserRole.BROKER)
  @ApiOperation({ summary: 'Create a new lead / prospect (CRM-02)' })
  createLead(@Body() body: any, @CurrentUser() user: User) {
    return this.svc.createLead(body, user.id);
  }

  @Get('leads')
  @ApiOperation({ summary: 'List and search leads with pipeline stage filter' })
  findLeads(
    @Query('stage') stage?: LeadStage,
    @Query('assignedToId') assignedToId?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.findLeads({
      stage, assignedToId, search,
      page: parseInt(page), limit: parseInt(limit),
    });
  }

  @Get('leads/stats')
  @ApiOperation({ summary: 'Lead conversion stats — by stage, overall conversion rate' })
  leadStats() {
    return this.svc.getLeadConversionStats();
  }

  @Patch('leads/:id/stage')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER, UserRole.BROKER)
  @ApiOperation({ summary: 'Advance or change lead stage (New → Contacted → Qualified → Converted)' })
  updateLeadStage(
    @Param('id') id: string,
    @Body('stage') stage: LeadStage,
    @Body('notes') notes: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.updateLeadStage(id, stage, user.id, notes);
  }

  // ── SUPPORT TICKETS ───────────────────────────────────────────────────────

  @Post('tickets')
  @ApiOperation({ summary: 'Create a customer support ticket (CRM-08)' })
  createTicket(
    @Body() body: {
      customerId: string;
      subject: string;
      description: string;
      priority?: TicketPriority;
      category?: TicketCategory;
      policyId?: string;
      claimId?: string;
    },
    @CurrentUser() user: User,
  ) {
    return this.svc.createTicket(body, user.id);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'List support tickets with SLA status and filters' })
  findTickets(
    @Query('status') status?: TicketStatus,
    @Query('customerId') customerId?: string,
    @Query('priority') priority?: TicketPriority,
    @Query('slaBreached') slaBreached?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.findTickets({
      status, customerId, priority,
      slaBreached: slaBreached !== undefined ? slaBreached === 'true' : undefined,
      page: parseInt(page), limit: parseInt(limit),
    });
  }

  @Get('tickets/stats')
  @ApiOperation({ summary: 'Ticket stats — open, breached SLA, by priority' })
  ticketStats() {
    return this.svc.getTicketStats();
  }

  @Patch('tickets/:id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CLAIMS_OFFICER, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Update ticket status; supply resolution text when resolving' })
  updateTicketStatus(
    @Param('id') id: string,
    @Body('status') status: TicketStatus,
    @Body('resolution') resolution: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.updateTicketStatus(id, status, user.id, resolution);
  }

  @Post('tickets/:id/comments')
  @ApiOperation({ summary: 'Add a comment / reply to a support ticket' })
  addComment(
    @Param('id') id: string,
    @Body('body') body: string,
    @Body('isInternal') isInternal: boolean,
    @CurrentUser() user: User,
  ) {
    return this.svc.addComment(
      id, body, user.id,
      `${user.firstName} ${user.lastName}`,
      isInternal,
    );
  }
}
