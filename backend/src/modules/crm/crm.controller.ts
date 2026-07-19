import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UploadedFile, UseInterceptors, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import {
  CrmService, CreateCustomerDto, UpdateCustomerDto, LogCommunicationDto,
} from './crm.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { CustomerType, CustomerStatus, CustomerSegment, KycStatus } from './entities/customer.entity';
import { KycDocumentType, KycDocumentStatus } from './entities/kyc-document.entity';

@ApiTags('CRM — Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  // ── CUSTOMERS ────────────────────────────────────────────────────────────

  @Post('customers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Create a new customer record' })
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: User) {
    return this.crmService.create(dto, user.id);
  }

  @Get('customers')
  @ApiOperation({ summary: 'Search and list customers with filters' })
  findAll(
    @Query('search') search?: string,
    @Query('type') type?: CustomerType,
    @Query('status') status?: CustomerStatus,
    @Query('kycStatus') kycStatus?: KycStatus,
    @Query('segment') segment?: CustomerSegment,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.crmService.findAll({
      search, type, status, kycStatus, segment,
      page: parseInt(page), limit: parseInt(limit),
    });
  }

  @Get('customers/stats')
  @ApiOperation({ summary: 'Customer statistics for dashboard' })
  stats() {
    return this.crmService.getStats();
  }

  @Get('customers/:id')
  @ApiOperation({ summary: 'Get full customer record by ID' })
  findOne(@Param('id') id: string) {
    return this.crmService.findById(id);
  }

  @Get('customers/number/:customerNumber')
  @ApiOperation({ summary: 'Get customer by customer number' })
  findByNumber(@Param('customerNumber') customerNumber: string) {
    return this.crmService.findByNumber(customerNumber);
  }

  @Patch('customers/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Update customer record' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() user: User) {
    return this.crmService.update(id, dto, user.id);
  }

  @Patch('customers/:id/kyc-status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Update customer KYC status (Compliance Officer only)' })
  updateKycStatus(
    @Param('id') id: string,
    @Body('status') status: KycStatus,
    @Body('notes') notes: string,
    @CurrentUser() user: User,
  ) {
    return this.crmService.updateKycStatus(id, status, user.id, notes);
  }

  // ── KYC DOCUMENTS ────────────────────────────────────────────────────────

  @Post('customers/:id/kyc-documents')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Upload KYC document reference for a customer' })
  addKycDocument(
    @Param('id') customerId: string,
    @Body() body: {
      documentType: KycDocumentType;
      documentNumber?: string;
      fileKey: string;
      fileExtension: string;
      fileSizeBytes?: number;
      expiryDate?: string;
    },
    @CurrentUser() user: User,
  ) {
    return this.crmService.addKycDocument(
      customerId,
      {
        ...body,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
      },
      user.id,
    );
  }

  @Get('customers/:id/kyc-documents')
  @ApiOperation({ summary: 'List KYC documents for a customer' })
  getKycDocuments(@Param('id') customerId: string) {
    return this.crmService.getKycDocuments(customerId);
  }

  @Patch('kyc-documents/:docId/review')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Approve or reject a KYC document' })
  reviewKycDocument(
    @Param('docId') docId: string,
    @Body('status') status: KycDocumentStatus,
    @Body('rejectionReason') rejectionReason: string,
    @CurrentUser() user: User,
  ) {
    return this.crmService.reviewKycDocument(docId, status, user.id, rejectionReason);
  }

  // ── COMMUNICATIONS ────────────────────────────────────────────────────────

  @Post('customers/:id/communications')
  @ApiOperation({ summary: 'Log a communication interaction with a customer' })
  logCommunication(
    @Param('id') customerId: string,
    @Body() dto: LogCommunicationDto,
    @CurrentUser() user: User,
  ) {
    return this.crmService.logCommunication(customerId, dto, user.id);
  }

  @Get('customers/:id/communications')
  @ApiOperation({ summary: 'Get full communication history for a customer' })
  getCommunicationHistory(@Param('id') customerId: string) {
    return this.crmService.getCommunicationHistory(customerId);
  }
}
