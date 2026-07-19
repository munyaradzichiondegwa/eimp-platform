import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  ReinsuranceService, CreateTreatyDto, CedePolicyInput,
} from './reinsurance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { TreatyStatus } from './entities/reinsurance-treaty.entity';

@ApiTags('Finance - Reinsurance Accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance/reinsurance')
export class ReinsuranceController {
  constructor(private readonly svc: ReinsuranceService) {}

  @Post('treaties')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'FIN-09: Create a new reinsurance treaty' })
  createTreaty(@Body() dto: CreateTreatyDto, @CurrentUser() user: User) {
    return this.svc.createTreaty(dto, user.id);
  }

  @Get('treaties')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'List reinsurance treaties' })
  findTreaties(
    @Query('status') status?: TreatyStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.findTreaties({ status, page: parseInt(page), limit: parseInt(limit) });
  }

  @Get('summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Reinsurance dashboard - ceded premium, recoverables, recovered' })
  summary() {
    return this.svc.getSummary();
  }

  @Get('treaties/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get treaty by ID' })
  findTreaty(@Param('id') id: string) {
    return this.svc.findTreatyById(id);
  }

  @Patch('treaties/:id/activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Activate a treaty - enables automated cession on new policies' })
  activateTreaty(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.activateTreaty(id, user.id);
  }

  @Post('treaties/:id/cede')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Cede a policy to a treaty - calculates and records the cession' })
  cedePolicy(@Param('id') treatyId: string, @Body() input: CedePolicyInput, @CurrentUser() user: User) {
    return this.svc.cedePolicy(treatyId, input, user.id);
  }

  @Get('policies/:policyId/cessions')
  @ApiOperation({ summary: 'Get all cession records for a policy' })
  getCessionsForPolicy(@Param('policyId') policyId: string) {
    return this.svc.getCessionForPolicy(policyId);
  }

  @Post('treaties/:id/recovery/excess-of-loss')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.CLAIMS_OFFICER)
  @ApiOperation({ summary: 'Calculate XoL recovery for a claim (layer above retention)' })
  calculateXolRecovery(
    @Param('id') treatyId: string,
    @Body() body: { claimId: string; claimNumber: string; grossClaimAmount: number },
    @CurrentUser() user: User,
  ) {
    return this.svc.calculateAndRecordRecovery(
      treatyId, body.claimId, body.claimNumber, body.grossClaimAmount, user.id,
    );
  }

  @Post('cessions/:cessionId/recovery')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.CLAIMS_OFFICER)
  @ApiOperation({ summary: 'Calculate proportional recovery for a previously ceded policy claim' })
  calculateCessionRecovery(
    @Param('cessionId') cessionId: string,
    @Body() body: { claimId: string; claimNumber: string; grossClaimAmount: number },
    @CurrentUser() user: User,
  ) {
    return this.svc.calculateRecoveryForCession(
      cessionId, body.claimId, body.claimNumber, body.grossClaimAmount, user.id,
    );
  }

  @Patch('recoveries/:id/confirm-received')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Confirm recovery payment received from reinsurer - posts to GL' })
  confirmRecovery(
    @Param('id') id: string,
    @Body('amount') amount: number,
    @CurrentUser() user: User,
  ) {
    return this.svc.confirmRecoveryReceived(id, amount, user.id);
  }

  @Post('treaties/:id/bordereaux/generate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Generate monthly bordereau (format YYYY-MM) - posts net cession to GL' })
  generateBordereau(
    @Param('id') treatyId: string,
    @Body('period') period: string,
    @CurrentUser() user: User,
  ) {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('period must be in format YYYY-MM');
    }
    return this.svc.generateMonthlyBordereau(treatyId, period, user.id);
  }

  @Get('treaties/:id/bordereaux')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'List bordereaux issued for a treaty' })
  getBordereaux(@Param('id') treatyId: string) {
    return this.svc.getBordereaux(treatyId);
  }

  @Patch('bordereaux/:id/settle')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Mark bordereau as settled - posts settlement to GL' })
  settleBordereau(
    @Param('id') id: string,
    @Body('settlementRef') settlementRef: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.settleBordereau(id, settlementRef, user.id);
  }
}
