import {
  Controller, Get, Post, Patch, Body, Param, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomerPortalService } from './customer-portal.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { KycDocumentType } from '../crm/entities/kyc-document.entity';
import { ClaimDocumentType } from '../claims/entities/claim-document.entity';
import { TicketCategory } from '../crm/entities/support-ticket.entity';

/**
 * Every endpoint here is restricted to UserRole.CUSTOMER and every method
 * resolves data via the authenticated user's own customer record - see
 * CustomerPortalService for the actual access-control boundary. This
 * controller implements PRD section 4.5.1 (CP-01 through CP-06).
 */
@ApiTags('Customer Self-Service Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@Controller('portal')
export class CustomerPortalController {
  constructor(private readonly svc: CustomerPortalService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my customer profile' })
  getMyProfile(@CurrentUser() user: User) {
    return this.svc.getMyProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'CP-06: Update my personal information' })
  updateMyProfile(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.updateMyProfile(user.id, body);
  }

  @Post('me/kyc-documents')
  @ApiOperation({ summary: 'CP-01: Upload a KYC document' })
  uploadKyc(
    @CurrentUser() user: User,
    @Body() body: {
      documentType: KycDocumentType;
      documentNumber?: string;
      fileKey: string;
      fileExtension: string;
      fileSizeBytes?: number;
    },
  ) {
    return this.svc.uploadMyKycDocument(user.id, body);
  }

  @Get('me/kyc-documents')
  @ApiOperation({ summary: 'List my uploaded KYC documents and review status' })
  getMyKyc(@CurrentUser() user: User) {
    return this.svc.getMyKycDocuments(user.id);
  }

  @Post('quote')
  @ApiOperation({ summary: 'CP-02: Get an online quotation for a product' })
  getQuote(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.getQuote(user.id, body);
  }

  @Post('policies')
  @ApiOperation({ summary: 'CP-02: Purchase a policy (requires approved KYC)' })
  purchasePolicy(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.purchasePolicy(user.id, body);
  }

  @Get('policies')
  @ApiOperation({ summary: 'List my policies' })
  getMyPolicies(@CurrentUser() user: User) {
    return this.svc.getMyPolicies(user.id);
  }

  @Get('policies/:id')
  @ApiOperation({ summary: 'Get one of my policies by ID' })
  getMyPolicy(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.getMyPolicy(user.id, id);
  }

  @Get('policies/:id/documents/schedule')
  @ApiOperation({ summary: 'CP-04: Download my policy schedule PDF' })
  async downloadSchedule(@CurrentUser() user: User, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.svc.downloadMyPolicySchedule(user.id, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="policy-schedule.pdf"' });
    res.end(pdf);
  }

  @Get('policies/:id/documents/certificate')
  @ApiOperation({ summary: 'CP-04: Download my certificate of insurance PDF' })
  async downloadCertificate(@CurrentUser() user: User, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.svc.downloadMyCertificate(user.id, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="certificate.pdf"' });
    res.end(pdf);
  }

  @Post('claims')
  @ApiOperation({ summary: 'CP-05: Submit a claim online' })
  submitClaim(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.submitMyClaim(user.id, body);
  }

  @Get('claims')
  @ApiOperation({ summary: 'CP-05: List my claims with status' })
  getMyClaims(@CurrentUser() user: User) {
    return this.svc.getMyClaims(user.id);
  }

  @Get('claims/:id')
  @ApiOperation({ summary: 'Get one of my claims by ID with full status detail' })
  getMyClaim(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.getMyClaim(user.id, id);
  }

  @Post('claims/:id/documents')
  @ApiOperation({ summary: 'CP-05: Attach a supporting document to my claim' })
  addClaimDocument(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { documentType: ClaimDocumentType; originalFilename?: string; fileKey: string; fileExtension?: string; fileSizeBytes?: number },
  ) {
    return this.svc.addMyClaimDocument(user.id, id, body);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List my premium invoices and outstanding balances' })
  getMyInvoices(@CurrentUser() user: User) {
    return this.svc.getMyInvoices(user.id);
  }

  @Post('payments')
  @ApiOperation({ summary: 'CP-03: Initiate a premium payment via mobile money or card' })
  initiatePayment(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.initiateMyPayment(user.id, body);
  }

  @Post('support-tickets')
  @ApiOperation({ summary: 'Raise a support ticket' })
  createTicket(
    @CurrentUser() user: User,
    @Body() body: { subject: string; description: string; category?: TicketCategory; policyId?: string; claimId?: string },
  ) {
    return this.svc.createMySupportTicket(user.id, body);
  }

  @Get('support-tickets')
  @ApiOperation({ summary: 'List my support tickets' })
  getMyTickets(@CurrentUser() user: User) {
    return this.svc.getMySupportTickets(user.id);
  }

  @Post('chat/start')
  @ApiOperation({ summary: 'Start or resume a chat session with the AI assistant' })
  startChat(@CurrentUser() user: User) {
    return this.svc.startChat(user.id);
  }

  @Post('chat/:sessionId/message')
  @ApiOperation({ summary: 'Send a message to the AI assistant' })
  sendMessage(
    @CurrentUser() user: User,
    @Param('sessionId') sessionId: string,
    @Body('message') message: string,
  ) {
    return this.svc.sendChatMessage(user.id, sessionId, message);
  }

  @Get('chat/history')
  @ApiOperation({ summary: 'My recent chat session history' })
  getChatHistory(@CurrentUser() user: User) {
    return this.svc.getChatHistory(user.id);
  }
}
