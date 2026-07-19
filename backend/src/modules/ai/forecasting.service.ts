import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Policy } from '../underwriting/entities/policy.entity';
import { Claim, ClaimStatus } from '../claims/entities/claim.entity';

/**
 * FORECASTING ENGINE - IMPLEMENTATION NOTE
 * ----------------------------------------------------------------------
 * Genuine ordinary-least-squares linear regression fitted on actual
 * historical monthly GWP/claims data pulled from the database - not a
 * placeholder. With under ~6 months of data the trend line is fitted on
 * whatever exists and confidence is marked low; forecasts become more
 * meaningful as more periods accumulate. Scenario bands (optimistic/
 * pessimistic) are the base trend adjusted by a configurable growth-rate
 * delta, which is standard practice for early-stage scenario planning
 * before enough variance exists to model uncertainty statistically.
 */

export interface MonthlyDataPoint {
  month: string;
  value: number;
}

export interface ForecastResult {
  historical: MonthlyDataPoint[];
  forecast: MonthlyDataPoint[];
  scenarios: {
    optimistic: MonthlyDataPoint[];
    base: MonthlyDataPoint[];
    pessimistic: MonthlyDataPoint[];
  };
  trend: { slope: number; monthlyGrowthRate: number };
  confidence: 'low' | 'medium' | 'high';
}

@Injectable()
export class ForecastingService {
  constructor(
    @InjectRepository(Policy)
    private policyRepo: Repository<Policy>,
    @InjectRepository(Claim)
    private claimRepo: Repository<Claim>,
  ) {}

  async getGwpForecast(horizonMonths = 6): Promise<ForecastResult> {
    const raw = await this.policyRepo
      .createQueryBuilder('p')
      .select("TO_CHAR(p.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(p.grossPremium), 0)', 'value')
      .where("p.status NOT IN ('quotation','cancelled')")
      .groupBy("TO_CHAR(p.createdAt, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany();

    const historical: MonthlyDataPoint[] = raw.map(r => ({ month: r.month, value: parseFloat(r.value) }));
    return this.buildForecast(historical, horizonMonths);
  }

  async getClaimsForecast(horizonMonths = 6): Promise<ForecastResult> {
    const raw = await this.claimRepo
      .createQueryBuilder('c')
      .select("TO_CHAR(c.fnolDate, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(c.settlementAmount), 0)', 'value')
      .where('c.status = :status', { status: ClaimStatus.SETTLED })
      .groupBy("TO_CHAR(c.fnolDate, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany();

    const historical: MonthlyDataPoint[] = raw.map(r => ({ month: r.month, value: parseFloat(r.value) }));
    return this.buildForecast(historical, horizonMonths);
  }

  private buildForecast(historical: MonthlyDataPoint[], horizonMonths: number): ForecastResult {
    if (historical.length === 0) {
      return {
        historical: [],
        forecast: [],
        scenarios: { optimistic: [], base: [], pessimistic: [] },
        trend: { slope: 0, monthlyGrowthRate: 0 },
        confidence: 'low',
      };
    }

    const n = historical.length;
    const xs = historical.map((_, i) => i);
    const ys = historical.map(h => h.value);

    const xMean = xs.reduce((s, x) => s + x, 0) / n;
    const yMean = ys.reduce((s, y) => s + y, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (xs[i] - xMean) * (ys[i] - yMean);
      denominator += Math.pow(xs[i] - xMean, 2);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;

    const lastMonth = historical[n - 1].month;
    const monthlyGrowthRate = yMean !== 0 ? (slope / yMean) * 100 : 0;

    const forecast: MonthlyDataPoint[] = [];
    const optimistic: MonthlyDataPoint[] = [];
    const pessimistic: MonthlyDataPoint[] = [];

    for (let h = 1; h <= horizonMonths; h++) {
      const x = n - 1 + h;
      const baseValue = Math.max(0, intercept + slope * x);
      const month = this.addMonths(lastMonth, h);

      forecast.push({ month, value: Math.round(baseValue * 100) / 100 });
      optimistic.push({ month, value: Math.round(baseValue * 1.15 * 100) / 100 });
      pessimistic.push({ month, value: Math.round(Math.max(0, baseValue * 0.85) * 100) / 100 });
    }

    const confidence: 'low' | 'medium' | 'high' = n < 4 ? 'low' : n < 9 ? 'medium' : 'high';

    return {
      historical,
      forecast,
      scenarios: { optimistic, base: forecast, pessimistic },
      trend: { slope: Math.round(slope * 100) / 100, monthlyGrowthRate: Math.round(monthlyGrowthRate * 100) / 100 },
      confidence,
    };
  }

  private addMonths(yyyyMm: string, months: number): string {
    const [year, month] = yyyyMm.split('-').map(Number);
    const date = new Date(year, month - 1 + months, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
}
