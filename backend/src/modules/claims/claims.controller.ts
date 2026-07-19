import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClaimsService, CreateClaimDto, UpdateClaimStatusDto, SettleClaimDto } from './claims.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { ClaimStatus } from './entities/claim.entity';
import { ClaimDocumentType } from './entities/claim-document.entity';

@ApiTags('Claims Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('claims')
export class ClaimsController {
  constructor(private readonly svc: ClaimsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit First Notice of Loss (FNOL) — multi-channel' })
  submitFnol(@Body() dto: CreateClaimDto, @CurrentUser() user: User) {
    return this.svc.submitFnol(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Search and list claims with filters' })
  findAll(
    @Query('status') status?: ClaimStatus,
    @Query('customerId') customerId?: string,
    @Query('policyId') policyId?: string,
    @Query('fraudFlagged') fraudFlagged?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.findAll({
      status, customerId, policyId,
      fraudFlagged: fraudFlagged !== undefined ? fraudFlagged === 'true' : undefined,
      search, page: parseInt(page), limit: parseInt(limit),
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Claims statistics for dashboard' })
  getStats() {
    return this.svc.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full claim record by ID' })
  findOne(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Patch(':id/register')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CLAIMS_OFFICER)
  @ApiOperation({ summary: 'Register FNOL as a formal claim and assign assessor' })
  register(
    @Param('id') id: string,
    @Body('assignedToId') assignedToId: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.registerClaim(id, assignedToId, user.id);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CLAIMS_OFFICER)
  @ApiOperation({ summary: 'Update claim status through workflow stages' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClaimStatusDto,
    @CurrentUser() user: User,
  ) {
    return this.svc.updateStatus(id, dto, user.id);
  }

  @Post(':id/settle')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CLAIMS_OFFICER)
  @ApiOperation({ summary: 'Initiate claim settlement payment' })
  settle(@Param('id') id: string, @Body() dto: SettleClaimDto, @CurrentUser() user: User) {
    return this.svc.settleClaim(id, dto, user.id);
  }

  @Patch(':id/confirm-settlement')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CLAIMS_OFFICER, UserRole.FINANCE)
  @ApiOperation({ summary: 'Confirm payment received and close claim' })
  confirmSettlement(
    @Param('id') id: string,
    @Body('paymentRef') paymentRef: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.confirmSettlement(id, paymentRef, user.id);
  }

  @Post(':id/documents')
  @ApiOperation({ summary: 'Upload supporting document for a claim' })
  addDocument(
    @Param('id') claimId: string,
    @Body() body: {
      documentType: ClaimDocumentType;
      originalFilename?: string;
      fileKey: string;
      fileExtension?: string;
      fileSizeBytes?: number;
      notes?: string;
    },
    @CurrentUser() user: User,
  ) {
    return this.svc.addDocument(claimId, body, user.id);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List all documents attached to a claim' })
  getDocuments(@Param('id') claimId: string) {
    return this.svc.getDocuments(claimId);
  }
}
