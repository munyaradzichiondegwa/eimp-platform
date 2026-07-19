import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Res, NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  UnderwritingService, CreateProductDto, QuotationDto,
  IssuePolicyDto, EndorseDto,
} from './underwriting.service';
import { DocumentGenerationService } from './document-generation.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { PolicyStatus } from './entities/policy.entity';

@ApiTags('Underwriting & Policy Administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('underwriting')
export class UnderwritingController {
  constructor(
    private readonly svc: UnderwritingService,
    private readonly docSvc: DocumentGenerationService,
  ) {}

  // ── PRODUCTS ──────────────────────────────────────────────────────────────

  @Post('products')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new insurance product (no code deployment needed)' })
  createProduct(@Body() dto: CreateProductDto, @CurrentUser() user: User) {
    return this.svc.createProduct(dto, user.id);
  }

  @Get('products')
  @ApiOperation({ summary: 'List all products' })
  getProducts(@Query('activeOnly') activeOnly: string) {
    return this.svc.getProducts(activeOnly === 'true');
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by ID' })
  getProduct(@Param('id') id: string) {
    return this.svc.getProductById(id);
  }

  @Patch('products/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update product configuration' })
  updateProduct(@Param('id') id: string, @Body() dto: Partial<CreateProductDto>, @CurrentUser() user: User) {
    return this.svc.updateProduct(id, dto, user.id);
  }

  @Patch('products/:id/activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Activate a product — makes it available for quotation' })
  activateProduct(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.activateProduct(id, user.id);
  }

  // ── QUOTATION ─────────────────────────────────────────────────────────────

  @Post('quote')
  @ApiOperation({ summary: 'Generate a premium quotation in under 2 seconds' })
  generateQuote(@Body() dto: QuotationDto) {
    return this.svc.generateQuote(dto);
  }

  // ── POLICY ISSUANCE ───────────────────────────────────────────────────────

  @Post('policies')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER, UserRole.BROKER)
  @ApiOperation({ summary: 'Issue a new policy (creates from quotation)' })
  issuePolicy(@Body() dto: IssuePolicyDto, @CurrentUser() user: User) {
    return this.svc.issuePolicy(dto, user.id);
  }

  @Get('policies')
  @ApiOperation({ summary: 'Search and list policies with filters' })
  findPolicies(
    @Query('customerId') customerId?: string,
    @Query('status') status?: PolicyStatus,
    @Query('productId') productId?: string,
    @Query('brokerId') brokerId?: string,
    @Query('search') search?: string,
    @Query('expiringDays') expiringDays?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.findPolicies({
      customerId, status, productId, brokerId, search,
      expiringDays: expiringDays ? parseInt(expiringDays) : undefined,
      page: parseInt(page), limit: parseInt(limit),
    });
  }

  @Get('policies/stats')
  @ApiOperation({ summary: 'Policy and GWP statistics for dashboard' })
  getStats() {
    return this.svc.getStats();
  }

  @Get('policies/:id')
  @ApiOperation({ summary: 'Get policy by ID' })
  findPolicyById(@Param('id') id: string) {
    return this.svc.findPolicyById(id);
  }

  @Get('policies/number/:policyNumber')
  @ApiOperation({ summary: 'Get policy by policy number' })
  findByNumber(@Param('policyNumber') policyNumber: string) {
    return this.svc.findPolicyByNumber(policyNumber);
  }

  @Patch('policies/:id/activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Activate policy after payment confirmation' })
  activatePolicy(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.activatePolicy(id, user.id);
  }

  @Patch('policies/:id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Cancel a policy with pro-rata refund calculation' })
  cancelPolicy(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.cancelPolicy(id, reason, user.id);
  }

  @Post('policies/:id/renew')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Create renewal policy from existing policy' })
  renewPolicy(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.renewPolicy(id, user.id);
  }

  // ── ENDORSEMENTS ──────────────────────────────────────────────────────────

  @Post('endorsements')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Create a policy endorsement (mid-term change)' })
  createEndorsement(@Body() dto: EndorseDto, @CurrentUser() user: User) {
    return this.svc.createEndorsement(dto, user.id);
  }

  @Get('policies/:id/endorsements')
  @ApiOperation({ summary: 'Get all endorsements for a policy' })
  getEndorsements(@Param('id') policyId: string) {
    return this.svc.getEndorsements(policyId);
  }

  @Patch('endorsements/:id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Approve and apply an endorsement' })
  approveEndorsement(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.approveEndorsement(id, user.id);
  }

  // ── DOCUMENT GENERATION (UW-04) ────────────────────────────────────────────
  // "Policy schedule PDF generated within 60 seconds of approval"

  @Get('policies/:id/documents/schedule')
  @ApiOperation({ summary: 'UW-04: Generate and download policy schedule PDF' })
  async downloadSchedule(@Param('id') id: string, @Res() res: Response) {
    const policy = await this.svc.findPolicyById(id);
    if (!policy.customer || !policy.product) {
      throw new NotFoundException('Policy is missing customer or product relation');
    }
    const pdf = await this.docSvc.generatePolicySchedule(policy, policy.customer, policy.product);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${policy.policyNumber}-Schedule.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  @Get('policies/:id/documents/certificate')
  @ApiOperation({ summary: 'Generate and download certificate of insurance PDF' })
  async downloadCertificate(@Param('id') id: string, @Res() res: Response) {
    const policy = await this.svc.findPolicyById(id);
    if (!policy.customer || !policy.product) {
      throw new NotFoundException('Policy is missing customer or product relation');
    }
    const pdf = await this.docSvc.generateCertificate(policy, policy.customer, policy.product);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${policy.policyNumber}-Certificate.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  @Get('endorsements/:id/documents/letter')
  @ApiOperation({ summary: 'Generate and download endorsement letter PDF' })
  async downloadEndorsementLetter(@Param('id') endorsementId: string, @Res() res: Response) {
    const endorsement = await this.svc.getEndorsementById(endorsementId);
    const policy = await this.svc.findPolicyById(endorsement.policyId);
    if (!policy.customer) {
      throw new NotFoundException('Policy is missing customer relation');
    }
    const pdf = await this.docSvc.generateEndorsementLetter(endorsement, policy, policy.customer);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${endorsement.endorsementNumber}-Letter.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }
}
