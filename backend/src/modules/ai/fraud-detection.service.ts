import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Claim } from '../claims/entities/claim.entity';

/**
 * FRAUD DETECTION ENGINE - IMPLEMENTATION NOTE
 * ----------------------------------------------------------------------
 * Statistical anomaly + rules-based detection, not a trained classifier.
 * Combines: (1) population statistics (z-scores against this product's
 * actual claims distribution, computed live from the database), (2)
 * behavioural rules (velocity, time-to-claim, round-number bias), and
 * (3) simple network analysis (claims clustering by customer). As settled
 * and rejected claim outcomes accumulate, this is the right place to
 * retrain a real anomaly detection or supervised fraud classifier -
 * scoreClaim() is built to accept that swap without touching calling code.
 */

export interface FraudFlag {
  rule: string;
  weight: number;
  description: string;
}

export interface FraudScoreResult {
  score: number;
  flagged: boolean;
  flags: FraudFlag[];
  recommendation: 'proceed' | 'manual_review' | 'investigate';
}

const FRAUD_FLAG_THRESHOLD = 50;
const INVESTIGATE_THRESHOLD = 75;

@Injectable()
export class FraudDetectionService {
  constructor(
    @InjectRepository(Claim)
    private claimRepo: Repository<Claim>,
  ) {}

  async scoreClaim(claim: Claim): Promise<FraudScoreResult> {
    const flags: FraudFlag[] = [];
    let score = 0;

    if (claim.claimedAmount && claim.policy?.productId) {
      const stats = await this.getProductClaimStats(claim.policy.productId);
      if (stats.count >= 5 && stats.stdDev > 0) {
        const zScore = (Number(claim.claimedAmount) - stats.mean) / stats.stdDev;
        if (zScore > 2.5) {
          const impact = Math.min(Math.round(zScore * 8), 35);
          score += impact;
          flags.push({
            rule: 'statistical_outlier',
            weight: impact,
            description: `Claim amount is ${zScore.toFixed(1)} standard deviations above the mean for this product (USD ${stats.mean.toFixed(0)} avg)`,
          });
        }
      }
    }

    if (claim.claimedAmount && Number(claim.claimedAmount) >= 1000) {
      const amount = Number(claim.claimedAmount);
      if (amount % 1000 === 0 || amount % 500 === 0) {
        const impact = 10;
        score += impact;
        flags.push({ rule: 'round_number', weight: impact, description: `Claimed amount (USD ${amount}) is a suspiciously round figure` });
      }
    }

    if (claim.policy?.startDate) {
      const daysSinceStart = Math.floor(
        (new Date(claim.eventDate).getTime() - new Date(claim.policy.startDate).getTime()) / 86400000,
      );
      if (daysSinceStart >= 0 && daysSinceStart < 7) {
        const impact = 35;
        score += impact;
        flags.push({ rule: 'immediate_claim', weight: impact, description: `Claim event occurred ${daysSinceStart} day(s) after policy inception` });
      } else if (daysSinceStart < 30) {
        const impact = 20;
        score += impact;
        flags.push({ rule: 'early_claim', weight: impact, description: `Claim event occurred ${daysSinceStart} days after policy inception` });
      } else if (daysSinceStart < 60) {
        const impact = 8;
        score += impact;
        flags.push({ rule: 'moderately_early_claim', weight: impact, description: `Claim event occurred ${daysSinceStart} days after policy inception` });
      }
    }

    const recentOnPolicy = await this.claimRepo
      .createQueryBuilder('c')
      .where('c.policyId = :pid', { pid: claim.policyId })
      .andWhere('c.id != :id', { id: claim.id })
      .andWhere("c.fnolDate >= NOW() - INTERVAL '90 days'")
      .getCount();
    if (recentOnPolicy > 0) {
      const impact = Math.min(recentOnPolicy * 15, 30);
      score += impact;
      flags.push({ rule: 'claim_velocity', weight: impact, description: `${recentOnPolicy} other claim(s) on this policy within 90 days` });
    }

    const recentByCustomer = await this.claimRepo
      .createQueryBuilder('c')
      .where('c.customerId = :cid', { cid: claim.customerId })
      .andWhere('c.id != :id', { id: claim.id })
      .andWhere("c.fnolDate >= NOW() - INTERVAL '180 days'")
      .getCount();
    if (recentByCustomer >= 2) {
      const impact = 15;
      score += impact;
      flags.push({ rule: 'multi_policy_claimant', weight: impact, description: `Customer has ${recentByCustomer} other claims across policies within 180 days` });
    }

    score = Math.min(100, Math.round(score));
    const flagged = score >= FRAUD_FLAG_THRESHOLD;
    const recommendation = score >= INVESTIGATE_THRESHOLD ? 'investigate' : flagged ? 'manual_review' : 'proceed';

    return { score, flagged, flags, recommendation };
  }

  private async getProductClaimStats(productId: string): Promise<{ mean: number; stdDev: number; count: number }> {
    const claims = await this.claimRepo
      .createQueryBuilder('c')
      .innerJoin('c.policy', 'p')
      .where('p.productId = :productId', { productId })
      .andWhere('c.claimedAmount IS NOT NULL')
      .select('c.claimedAmount', 'claimedAmount')
      .getRawMany();

    const amounts = claims.map(c => Number(c.claimedAmount)).filter(a => !isNaN(a) && a > 0);
    const count = amounts.length;
    if (count === 0) return { mean: 0, stdDev: 0, count: 0 };

    const mean = amounts.reduce((s, a) => s + a, 0) / count;
    const variance = amounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev, count };
  }
}
