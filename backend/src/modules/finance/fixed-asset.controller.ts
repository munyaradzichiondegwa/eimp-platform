import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FixedAssetService, CreateAssetDto } from './fixed-asset.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { AssetCategory, AssetStatus } from './entities/fixed-asset.entity';

@ApiTags('Finance — Fixed Asset Register')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance/assets')
export class FixedAssetController {
  constructor(private readonly svc: FixedAssetService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'FIN-06: Register a new fixed asset with depreciation schedule' })
  create(@Body() dto: CreateAssetDto, @CurrentUser() user: User) {
    return this.svc.createAsset(dto, user.id);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'List fixed asset register' })
  findAll(
    @Query('category') category?: AssetCategory,
    @Query('status') status?: AssetStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.findAll({ category, status, page: parseInt(page), limit: parseInt(limit) });
  }

  @Get('summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Register summary — total cost, accumulated depreciation, NBV by category' })
  summary() {
    return this.svc.getRegisterSummary();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get fixed asset by ID' })
  findOne(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post('depreciation/run')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Manually trigger depreciation run for a period (format: YYYY-MM)' })
  runDepreciation(@Body('period') period: string, @CurrentUser() user: User) {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('period must be in format YYYY-MM');
    }
    return this.svc.runMonthlyDepreciation(period, user.id);
  }

  @Patch(':id/dispose')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Dispose of an asset and post gain/loss to GL' })
  dispose(
    @Param('id') id: string,
    @Body('proceeds') proceeds: number,
    @Body('notes') notes: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.disposeAsset(id, proceeds, notes, user.id);
  }
}
