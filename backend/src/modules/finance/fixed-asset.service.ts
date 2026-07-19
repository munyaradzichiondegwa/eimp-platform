import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  FixedAsset, AssetCategory, AssetStatus, DepreciationMethod,
} from './entities/fixed-asset.entity';
import { FinanceService } from './finance.service';
import { GlEntrySource } from './entities/gl-entry.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';

export interface CreateAssetDto {
  description: string;
  category: AssetCategory;
  acquisitionDate: string;
  cost: number;
  residualValue?: number;
  usefulLifeMonths: number;
  depreciationMethod?: DepreciationMethod;
  reducingBalanceRate?: number;
  location?: string;
  custodian?: string;
}

@Injectable()
export class FixedAssetService {
  private readonly logger = new Logger(FixedAssetService.name);

  constructor(
    @InjectRepository(FixedAsset)
    private assetRepo: Repository<FixedAsset>,
    private financeService: FinanceService,
    private auditService: AuditService,
  ) {}

  async createAsset(dto: CreateAssetDto, createdById: string): Promise<FixedAsset> {
    if (dto.usefulLifeMonths <= 0) {
      throw new BadRequestException('Useful life must be greater than zero months');
    }
    if ((dto.residualValue || 0) >= dto.cost) {
      throw new BadRequestException('Residual value must be less than acquisition cost');
    }

    const count = await this.assetRepo.count();
    const asset = this.assetRepo.create({
      ...dto,
      acquisitionDate: new Date(dto.acquisitionDate),
      assetCode: `EBA-FA-${String(count + 1).padStart(6, '0')}`,
      residualValue: dto.residualValue || 0,
      netBookValue: dto.cost,
      accumulatedDepreciation: 0,
      status: AssetStatus.ACTIVE,
      createdById,
    });

    const saved = await this.assetRepo.save(asset);

    await this.financeService.postJournal({
      source: GlEntrySource.MANUAL_JOURNAL,
      sourceId: saved.id,
      sourceRef: saved.assetCode,
      description: `Fixed asset acquired: ${saved.assetCode} — ${saved.description}`,
      currency: 'USD',
      lines: [
        { accountCode: '1500', debit: dto.cost, description: 'Fixed asset acquisition' },
        { accountCode: '2400', credit: dto.cost, description: 'Payable / Bank' },
      ],
    }, createdById);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'fixed_asset',
      entityId: saved.id, entityRef: saved.assetCode,
      userId: createdById, module: 'finance',
      description: `Fixed asset registered: ${saved.assetCode} — ${saved.description} (USD ${dto.cost})`,
    });

    return saved;
  }

  async findAll(options: {
    category?: AssetCategory;
    status?: AssetStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: FixedAsset[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const where: any = {};
    if (options.category) where.category = options.category;
    if (options.status) where.status = options.status;

    const [data, total] = await this.assetRepo.findAndCount({
      where, skip: (page - 1) * limit, take: limit,
      order: { acquisitionDate: 'DESC' },
    });
    return { data, total };
  }

  async findById(id: string): Promise<FixedAsset> {
    const asset = await this.assetRepo.findOne({ where: { id } });
    if (!asset) throw new NotFoundException(`Asset ${id} not found`);
    return asset;
  }

  calculateMonthlyDepreciation(asset: FixedAsset): number {
    const depreciableAmount = asset.cost - asset.residualValue;

    if (asset.depreciationMethod === DepreciationMethod.STRAIGHT_LINE) {
      return Math.round((depreciableAmount / asset.usefulLifeMonths) * 100) / 100;
    }

    const annualRate = (asset.reducingBalanceRate || 20) / 100;
    const monthlyRate = annualRate / 12;
    const charge = asset.netBookValue * monthlyRate;
    return Math.round(Math.min(charge, asset.netBookValue - asset.residualValue) * 100) / 100;
  }

  async runMonthlyDepreciation(period: string, userId: string): Promise<{
    processed: number;
    totalDepreciation: number;
    assets: Array<{ assetCode: string; charge: number; newNbv: number }>;
  }> {
    const activeAssets = await this.assetRepo.find({ where: { status: AssetStatus.ACTIVE } });
    const results: Array<{ assetCode: string; charge: number; newNbv: number }> = [];
    let totalDepreciation = 0;

    for (const asset of activeAssets) {
      const periodDate = new Date(`${period}-01`);
      if (asset.lastDepreciationRunDate) {
        const last = new Date(asset.lastDepreciationRunDate);
        if (last.getFullYear() === periodDate.getFullYear() && last.getMonth() === periodDate.getMonth()) {
          continue;
        }
      }

      const charge = this.calculateMonthlyDepreciation(asset);
      if (charge <= 0) continue;

      asset.accumulatedDepreciation = Number(asset.accumulatedDepreciation) + charge;
      asset.netBookValue = Math.max(asset.cost - asset.accumulatedDepreciation, asset.residualValue);
      asset.lastDepreciationRunDate = periodDate;

      if (asset.netBookValue <= asset.residualValue + 0.01) {
        asset.status = AssetStatus.FULLY_DEPRECIATED;
      }

      await this.assetRepo.save(asset);
      totalDepreciation += charge;
      results.push({ assetCode: asset.assetCode, charge, newNbv: asset.netBookValue });
    }

    if (results.length > 0) {
      await this.financeService.postJournal({
        source: GlEntrySource.DEPRECIATION,
        sourceRef: `DEPN-${period}`,
        description: `Monthly depreciation — ${period} (${results.length} assets)`,
        currency: 'USD',
        period,
        lines: [
          { accountCode: '5300', debit: totalDepreciation, description: `Depreciation expense ${period}` },
          { accountCode: '1501', credit: totalDepreciation, description: `Accumulated depreciation ${period}` },
        ],
      }, userId);

      await this.auditService.log({
        action: AuditAction.CREATE, entityType: 'depreciation_run',
        entityId: period, entityRef: `DEPN-${period}`,
        userId, module: 'finance',
        description: `Depreciation run for ${period}: ${results.length} assets, USD ${totalDepreciation.toFixed(2)}`,
      });
    }

    return { processed: results.length, totalDepreciation, assets: results };
  }

  @Cron('0 3 1 * *', { timeZone: 'Africa/Harare' })
  async scheduledMonthlyDepreciation(): Promise<void> {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = lastMonth.toISOString().slice(0, 7);

    this.logger.log(`Running scheduled depreciation for ${period}...`);
    try {
      const result = await this.runMonthlyDepreciation(period, 'system');
      this.logger.log(`Depreciation complete: ${result.processed} assets, USD ${result.totalDepreciation.toFixed(2)}`);
    } catch (err) {
      this.logger.error(`Scheduled depreciation failed: ${err.message}`);
    }
  }

  async disposeAsset(
    id: string, proceeds: number, notes: string, userId: string,
  ): Promise<FixedAsset> {
    const asset = await this.findById(id);
    if (asset.status === AssetStatus.DISPOSED) {
      throw new BadRequestException('Asset already disposed');
    }

    const gainLoss = proceeds - asset.netBookValue;
    asset.status = AssetStatus.DISPOSED;
    asset.disposalDate = new Date();
    asset.disposalProceeds = proceeds;
    asset.disposalNotes = notes;
    const saved = await this.assetRepo.save(asset);

    await this.financeService.postJournal({
      source: GlEntrySource.MANUAL_JOURNAL,
      sourceId: asset.id,
      sourceRef: asset.assetCode,
      description: `Asset disposal: ${asset.assetCode} (${gainLoss >= 0 ? 'gain' : 'loss'} USD ${Math.abs(gainLoss).toFixed(2)})`,
      currency: 'USD',
      lines: gainLoss >= 0
        ? [
            { accountCode: '1100', debit: proceeds, description: 'Disposal proceeds' },
            { accountCode: '1500', credit: asset.netBookValue, description: 'Asset NBV written off' },
            { accountCode: '4200', credit: gainLoss, description: 'Gain on disposal' },
          ]
        : [
            { accountCode: '1100', debit: proceeds, description: 'Disposal proceeds' },
            { accountCode: '5300', debit: Math.abs(gainLoss), description: 'Loss on disposal' },
            { accountCode: '1500', credit: asset.netBookValue, description: 'Asset NBV written off' },
          ],
    }, userId);

    await this.auditService.log({
      action: AuditAction.UPDATE, entityType: 'fixed_asset',
      entityId: id, entityRef: asset.assetCode,
      userId, module: 'finance',
      description: `Asset disposed: ${asset.assetCode} — proceeds USD ${proceeds}`,
    });

    return saved;
  }

  async getRegisterSummary(): Promise<{
    totalAssets: number;
    totalCost: number;
    totalAccumulatedDepreciation: number;
    totalNetBookValue: number;
    byCategory: Record<string, { count: number; nbv: number }>;
  }> {
    const assets = await this.assetRepo.find({ where: { status: AssetStatus.ACTIVE } });

    const byCategory: Record<string, { count: number; nbv: number }> = {};
    for (const cat of Object.values(AssetCategory)) {
      const catAssets = assets.filter(a => a.category === cat);
      byCategory[cat] = {
        count: catAssets.length,
        nbv: catAssets.reduce((s, a) => s + Number(a.netBookValue), 0),
      };
    }

    return {
      totalAssets: assets.length,
      totalCost: assets.reduce((s, a) => s + Number(a.cost), 0),
      totalAccumulatedDepreciation: assets.reduce((s, a) => s + Number(a.accumulatedDepreciation), 0),
      totalNetBookValue: assets.reduce((s, a) => s + Number(a.netBookValue), 0),
      byCategory,
    };
  }
}
