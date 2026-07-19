import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  WeatherReading, WeatherMetric,
} from './entities/weather-reading.entity';
import {
  WeatherTriggerEvent, TriggerEventStatus,
} from './entities/weather-trigger-event.entity';
import { Product, ProductType, ProductStatus } from './entities/product.entity';
import { Policy, PolicyStatus } from './entities/policy.entity';
import { ClaimsService } from '../claims/claims.service';
import { ClaimType, ClaimChannel } from '../claims/entities/claim.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';

// Plausibility bounds per metric — readings outside this range are flagged
// as anomalies rather than silently trusted (data quality safeguard).
const PLAUSIBILITY_BOUNDS: Record<WeatherMetric, [number, number]> = {
  [WeatherMetric.RAINFALL_MM]: [0, 500],
  [WeatherMetric.TEMPERATURE_C]: [-10, 55],
  [WeatherMetric.SOIL_MOISTURE_PCT]: [0, 100],
  [WeatherMetric.DROUGHT_INDEX]: [-5, 5],
};

export interface IngestReadingDto {
  stationId: string;
  readingDate: string;
  metric: WeatherMetric;
  value: number;
  source?: string;
  rawPayload?: Record<string, any>;
}

@Injectable()
export class WeatherIndexService {
  private readonly logger = new Logger(WeatherIndexService.name);

  constructor(
    @InjectRepository(WeatherReading)
    private readingRepo: Repository<WeatherReading>,
    @InjectRepository(WeatherTriggerEvent)
    private eventRepo: Repository<WeatherTriggerEvent>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Policy)
    private policyRepo: Repository<Policy>,
    private claimsService: ClaimsService,
    private auditService: AuditService,
    private configService: ConfigService,
  ) {}

  // ── DATA INGESTION ────────────────────────────────────────────────────────
  // "System ingests daily weather data API feed"

  async ingestReading(dto: IngestReadingDto): Promise<WeatherReading> {
    const [min, max] = PLAUSIBILITY_BOUNDS[dto.metric];
    const isAnomaly = dto.value < min || dto.value > max;

    if (isAnomaly) {
      this.logger.warn(
        `Anomalous weather reading: ${dto.stationId} ${dto.metric}=${dto.value} (expected ${min}-${max})`,
      );
    }

    const existing = await this.readingRepo.findOne({
      where: { stationId: dto.stationId, readingDate: new Date(dto.readingDate), metric: dto.metric },
    });

    if (existing) {
      existing.value = dto.value;
      existing.source = dto.source || existing.source;
      existing.isAnomaly = isAnomaly;
      existing.rawPayload = dto.rawPayload;
      return this.readingRepo.save(existing);
    }

    const reading = this.readingRepo.create({
      ...dto,
      readingDate: new Date(dto.readingDate),
      isAnomaly,
    });
    return this.readingRepo.save(reading);
  }

  async ingestBatch(readings: IngestReadingDto[]): Promise<{ ingested: number; anomalies: number }> {
    let anomalies = 0;
    for (const r of readings) {
      const saved = await this.ingestReading(r);
      if (saved.isAnomaly) anomalies++;
    }
    return { ingested: readings.length, anomalies };
  }

  // ── PROVIDER FEED PULL (ZIMMET / commercial provider) ────────────────────
  // Scheduled daily ingestion — pulls yesterday's readings for all stations
  // that have active agriculture policies attached.

  @Cron('0 6 * * *', { timeZone: 'Africa/Harare' })
  async scheduledDailyIngestion(): Promise<void> {
    const apiUrl = this.configService.get<string>('weather.apiUrl');
    const apiKey = this.configService.get<string>('weather.apiKey');

    if (!apiUrl || !apiKey) {
      this.logger.warn('Weather API not configured - skipping scheduled ingestion. Configure WEATHER_API_URL and WEATHER_API_KEY.');
      return;
    }

    const stationIds = await this.getActiveStationIds();
    if (stationIds.length === 0) {
      this.logger.log('No active agriculture policies - skipping weather ingestion.');
      return;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    for (const stationId of stationIds) {
      try {
        const response = await axios.get(`${apiUrl}/stations/${stationId}/daily`, {
          params: { date: dateStr },
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 15000,
        });

        const data = response.data;
        if (data?.rainfall_mm !== undefined) {
          await this.ingestReading({
            stationId, readingDate: dateStr,
            metric: WeatherMetric.RAINFALL_MM, value: data.rainfall_mm,
            source: 'zimmet', rawPayload: data,
          });
        }
        if (data?.temperature_c !== undefined) {
          await this.ingestReading({
            stationId, readingDate: dateStr,
            metric: WeatherMetric.TEMPERATURE_C, value: data.temperature_c,
            source: 'zimmet', rawPayload: data,
          });
        }
      } catch (err) {
        this.logger.error(`Weather ingestion failed for station ${stationId}: ${err.message}`);
      }
    }

    await this.checkAllTriggers();
  }

  private async getActiveStationIds(): Promise<string[]> {
    const products = await this.productRepo.find({
      where: { type: ProductType.AGRICULTURE_WEATHER_INDEX, status: ProductStatus.ACTIVE },
    });
    const stationIds = new Set<string>();
    for (const p of products) {
      if (p.weatherIndexConfig?.stationId) stationIds.add(p.weatherIndexConfig.stationId);
    }
    return Array.from(stationIds);
  }

  // ── THRESHOLD DETECTION & PAYOUT TRIGGER ──────────────────────────────────
  // "Triggers payout event when index threshold breached;
  //  payout calculated per product rules"

  async checkAllTriggers(): Promise<WeatherTriggerEvent[]> {
    const products = await this.productRepo.find({
      where: { type: ProductType.AGRICULTURE_WEATHER_INDEX, status: ProductStatus.ACTIVE },
    });

    const events: WeatherTriggerEvent[] = [];
    for (const product of products) {
      const event = await this.checkProductTrigger(product);
      if (event) events.push(event);
    }
    return events;
  }

  async checkProductTrigger(product: Product): Promise<WeatherTriggerEvent | null> {
    const config = product.weatherIndexConfig;
    if (!config?.stationId || !config.triggerThreshold || !config.triggerType) {
      return null;
    }

    const period = this.resolveMeasurementPeriod(config.measurementPeriod);
    const metric = this.triggerTypeToMetric(config.triggerType);

    const readings = await this.readingRepo.find({
      where: {
        stationId: config.stationId,
        metric,
        readingDate: Between(period.start, period.end) as any,
      },
    });

    if (readings.length === 0) return null;

    const aggregated = metric === WeatherMetric.RAINFALL_MM
      ? readings.reduce((s, r) => s + Number(r.value), 0)
      : readings.reduce((s, r) => s + Number(r.value), 0) / readings.length;

    const breached = this.isThresholdBreached(config.triggerType, aggregated, config.triggerThreshold);
    if (!breached) return null;

    const existing = await this.eventRepo.findOne({
      where: {
        productId: product.id,
        measurementPeriodStart: period.start,
        measurementPeriodEnd: period.end,
      },
    });
    if (existing) return existing;

    const level = this.resolvePayoutLevel(config.payoutSchedule, aggregated, config.triggerThreshold);
    if (!level) return null;

    const hasAnomalies = readings.some(r => r.isAnomaly);

    const count = await this.eventRepo.count();
    const event = this.eventRepo.create({
      eventRef: `EBA-WX-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`,
      stationId: config.stationId,
      productId: product.id,
      triggerDate: new Date(),
      measurementPeriodStart: period.start,
      measurementPeriodEnd: period.end,
      triggerType: config.triggerType,
      measuredValue: aggregated,
      thresholdValue: config.triggerThreshold,
      payoutLevel: level.level,
      payoutPercentage: level.payout,
      status: hasAnomalies ? TriggerEventStatus.REVIEW_REQUIRED : TriggerEventStatus.DETECTED,
    });

    const saved = await this.eventRepo.save(event);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'weather_trigger_event',
      entityId: saved.id, entityRef: saved.eventRef,
      userId: 'system', module: 'underwriting',
      description: `Weather trigger detected: ${product.name} - ${config.triggerType} ${aggregated} vs threshold ${config.triggerThreshold} (level: ${level.level})`,
    });

    this.logger.warn(`WEATHER TRIGGER: ${saved.eventRef} - ${product.name} at station ${config.stationId}`);

    if (!hasAnomalies) {
      await this.processPayouts(saved.id);
    }

    return saved;
  }

  // ── AUTOMATED PAYOUT PROCESSING ───────────────────────────────────────────

  async processPayouts(eventId: string): Promise<WeatherTriggerEvent> {
    const event = await this.findEventById(eventId);
    if (event.status === TriggerEventStatus.CLAIMS_CREATED || event.status === TriggerEventStatus.SETTLED) {
      throw new BadRequestException('Payouts already processed for this event');
    }

    const affectedPolicies = await this.policyRepo.find({
      where: { productId: event.productId, status: PolicyStatus.ACTIVE },
      relations: ['customer'],
    });

    const policyIds: string[] = [];
    const claimIds: string[] = [];
    let totalPayout = 0;

    for (const policy of affectedPolicies) {
      const payoutAmount = Math.round(Number(policy.sumInsured) * (event.payoutPercentage / 100) * 100) / 100;
      if (payoutAmount <= 0) continue;

      const claim = await this.claimsService.submitFnol({
        policyId: policy.id,
        customerId: policy.customerId,
        claimType: ClaimType.WEATHER_TRIGGER,
        channel: ClaimChannel.SYSTEM_AUTOMATED,
        eventDate: event.triggerDate.toISOString().split('T')[0],
        eventDescription: `Automated parametric trigger: ${event.triggerType} threshold breached (${event.measuredValue} vs ${event.thresholdValue}). Event ref: ${event.eventRef}.`,
        claimedAmount: payoutAmount,
        currency: policy.currency,
      }, 'system');

      policyIds.push(policy.id);
      claimIds.push(claim.id);
      totalPayout += payoutAmount;
    }

    event.affectedPolicyCount = policyIds.length;
    event.affectedPolicyIds = policyIds;
    event.generatedClaimIds = claimIds;
    event.totalPayoutAmount = totalPayout;
    event.status = TriggerEventStatus.CLAIMS_CREATED;

    const saved = await this.eventRepo.save(event);

    await this.auditService.log({
      action: AuditAction.CREATE, entityType: 'weather_trigger_event',
      entityId: event.id, entityRef: event.eventRef,
      userId: 'system', module: 'underwriting',
      description: `Payouts processed: ${policyIds.length} policies, USD ${totalPayout.toFixed(2)} total, ${claimIds.length} claims auto-created`,
    });

    return saved;
  }

  // ── MANUAL REVIEW (for anomalous data) ────────────────────────────────────

  async approveReviewedEvent(eventId: string, userId: string, notes?: string): Promise<WeatherTriggerEvent> {
    const event = await this.findEventById(eventId);
    if (event.status !== TriggerEventStatus.REVIEW_REQUIRED) {
      throw new BadRequestException('Event is not pending review');
    }

    event.status = TriggerEventStatus.DETECTED;
    event.reviewedById = userId;
    event.reviewedAt = new Date();
    event.reviewNotes = notes;
    await this.eventRepo.save(event);

    return this.processPayouts(eventId);
  }

  async rejectReviewedEvent(eventId: string, userId: string, notes: string): Promise<WeatherTriggerEvent> {
    const event = await this.findEventById(eventId);
    event.reviewedById = userId;
    event.reviewedAt = new Date();
    event.reviewNotes = notes;
    event.status = TriggerEventStatus.DETECTED;

    await this.auditService.log({
      action: AuditAction.REJECT, entityType: 'weather_trigger_event',
      entityId: eventId, entityRef: event.eventRef,
      userId, module: 'underwriting',
      description: `Weather trigger rejected after review: ${notes}`,
    });

    return this.eventRepo.save(event);
  }

  // ── QUERIES ───────────────────────────────────────────────────────────────

  async findEvents(options: {
    status?: TriggerEventStatus;
    productId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: WeatherTriggerEvent[]; total: number }> {
    const { page = 1, limit = 20 } = options;
    const where: any = {};
    if (options.status) where.status = options.status;
    if (options.productId) where.productId = options.productId;

    const [data, total] = await this.eventRepo.findAndCount({
      where, skip: (page - 1) * limit, take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total };
  }

  async findEventById(id: string): Promise<WeatherTriggerEvent> {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) throw new NotFoundException(`Weather trigger event ${id} not found`);
    return event;
  }

  async getReadings(stationId: string, from: Date, to: Date): Promise<WeatherReading[]> {
    return this.readingRepo.find({
      where: { stationId, readingDate: Between(from, to) as any },
      order: { readingDate: 'ASC' },
    });
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  private triggerTypeToMetric(triggerType: string): WeatherMetric {
    const map: Record<string, WeatherMetric> = {
      drought: WeatherMetric.RAINFALL_MM,
      flood: WeatherMetric.RAINFALL_MM,
      temperature: WeatherMetric.TEMPERATURE_C,
    };
    return map[triggerType] || WeatherMetric.RAINFALL_MM;
  }

  private resolveMeasurementPeriod(periodConfig?: string): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();
    const days = periodConfig?.endsWith('d') ? parseInt(periodConfig) : 30;
    start.setDate(start.getDate() - (isNaN(days) ? 30 : days));
    return { start, end };
  }

  private isThresholdBreached(triggerType: string, measured: number, threshold: number): boolean {
    if (triggerType === 'drought') return measured < threshold;
    return measured > threshold;
  }

  private resolvePayoutLevel(
    schedule: Array<{ level: string; payout: number }> | undefined,
    measured: number,
    threshold: number,
  ): { level: string; payout: number } | null {
    if (!schedule || schedule.length === 0) {
      return { level: 'full', payout: 100 };
    }
    const deviationRatio = threshold !== 0 ? Math.abs(measured - threshold) / Math.abs(threshold) : 1;
    const sorted = [...schedule].sort((a, b) => a.payout - b.payout);
    let selected = sorted[0];
    for (let i = 0; i < sorted.length; i++) {
      const requiredDeviation = i * 0.1;
      if (deviationRatio >= requiredDeviation) selected = sorted[i];
    }
    return selected;
  }
}
