import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Claim } from '../claims/entities/claim.entity';
import { Policy } from '../underwriting/entities/policy.entity';

/**
 * RISK SCORING ENGINE - IMPLEMENTATION NOTE
 * ----------------------------------------------------------------------
 * This is a weighted-feature statistical scoring engine, not a trained
 * machine-learning model. On day one of a new insurer there is no historical
 * claims/underwriting dataset large enough to train a meaningful model on -
 * building one and pretending otherwise would be dishonest and would produce
 * worse decisions than well-calibrated actuarial heuristics.
 *
 * This engine is deliberately structured so it can be swapped for a trained
 * model later: calculateRiskScore() takes a flat feature vector and returns
 * a score + factor breakdown, exactly the shape a real model's inference
 * wrapper would need to match. Once 12+ months of underwriting outcomes
 * exist (UW-03 referrals vs actual claims experience), retrain a logistic
 * regression or gradient-boosted model on RiskScoringInput -> loss outcome
 * and drop it in behind this same interface.
 */

export interface RiskScoringInput {
  productType: string;
  sumInsured: number;
  maxSumInsuredForProduct: number;
  customerAge?: number;
  isNewCustomer: boolean;
  priorClaimsCount: number;
  priorClaimsTotalAmount: number;
  kycApproved: boolean;
  policyTermMonths: number;
  distributionChannel: string;
}

export interface RiskFactor {
  name: string;
  impact: number;
  description: string;
}

export interface RiskScoreResult {
  score: number;
  band: 'low' | 'medium' | 'high';
  factors: RiskFactor[];
  recommendation: 'auto_approve' | 'refer' | 'decline';
  confidence: 'high' | 'medium' | 'low';
}

const BASE_SCORE = 25;

@Injectable()
export class RiskScoringService {
  constructor(
    @InjectRepository(Claim)
    private claimRepo: Repository<Claim>,
    @InjectRepository(Policy)
    private policyRepo: Repository<Policy>,
  ) {}

  calculateRiskScore(input: RiskScoringInput): RiskScoreResult {
    const factors: RiskFactor[] = [];
    let score = BASE_SCORE;

    const sumInsuredRatio = input.maxSumInsuredForProduct > 0
      ? input.sumInsured / input.maxSumInsuredForProduct
      : 0;
    if (sumInsuredRatio > 0.8) {
      const impact = 20;
      score += impact;
      factors.push({ name: 'high_sum_insured', impact, description: `Sum insured is ${(sumInsuredRatio * 100).toFixed(0)}% of product maximum` });
    } else if (sumInsuredRatio > 0.5) {
      const impact = 8;
      score += impact;
      factors.push({ name: 'moderate_sum_insured', impact, description: `Sum insured is ${(sumInsuredRatio * 100).toFixed(0)}% of product maximum` });
    }

    if (input.customerAge !== undefined) {
      if (input.customerAge < 21 || input.customerAge > 65) {
        const impact = 15;
        score += impact;
        factors.push({ name: 'age_band', impact, description: `Customer age (${input.customerAge}) outside standard risk band` });
      } else if (input.customerAge > 55) {
        const impact = 8;
        score += impact;
        factors.push({ name: 'age_band_moderate', impact, description: `Customer age (${input.customerAge}) in elevated risk band` });
      }
    }

    if (input.priorClaimsCount > 0) {
      const impact = Math.min(input.priorClaimsCount * 12, 40);
      score += impact;
      factors.push({
        name: 'claims_history',
        impact,
        description: `${input.priorClaimsCount} prior claim(s) totalling USD ${input.priorClaimsTotalAmount.toFixed(2)}`,
      });
    }

    if (!input.kycApproved) {
      const impact = 18;
      score += impact;
      factors.push({ name: 'kyc_incomplete', impact, description: 'KYC verification not yet approved' });
    }

    if (input.isNewCustomer) {
      factors.push({ name: 'new_customer', impact: 5, description: 'No prior policy history with EBA' });
      score += 5;
    }

    if (input.policyTermMonths > 24) {
      const impact = 6;
      score += impact;
      factors.push({ name: 'long_term', impact, description: `${input.policyTermMonths}-month term extends exposure window` });
    }

    if (input.distributionChannel !== 'direct_staff') {
      const impact = 3;
      score += impact;
      factors.push({ name: 'indirect_channel', impact, description: `Sold via ${input.distributionChannel.replace(/_/g, ' ')}` });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    const band = score < 35 ? 'low' : score < 65 ? 'medium' : 'high';
    const recommendation = score < 40 ? 'auto_approve' : score < 75 ? 'refer' : 'decline';
    const confidence = input.isNewCustomer && input.priorClaimsCount === 0 ? 'medium' : 'high';

    return { score, band, factors, recommendation, confidence };
  }

  async scoreForCustomer(params: {
    customerId: string;
    productType: string;
    sumInsured: number;
    maxSumInsuredForProduct: number;
    customerAge?: number;
    kycApproved: boolean;
    policyTermMonths: number;
    distributionChannel: string;
  }): Promise<RiskScoreResult> {
    const priorPolicies = await this.policyRepo.count({ where: { customerId: params.customerId } });
    const isNewCustomer = priorPolicies === 0;

    const priorClaims = await this.claimRepo
      .createQueryBuilder('c')
      .where('c.customerId = :customerId', { customerId: params.customerId })
      .getMany();

    const priorClaimsTotalAmount = priorClaims.reduce(
      (sum, c) => sum + Number(c.settlementAmount || c.claimedAmount || 0), 0,
    );

    return this.calculateRiskScore({
      productType: params.productType,
      sumInsured: params.sumInsured,
      maxSumInsuredForProduct: params.maxSumInsuredForProduct,
      customerAge: params.customerAge,
      isNewCustomer,
      priorClaimsCount: priorClaims.length,
      priorClaimsTotalAmount,
      kycApproved: params.kycApproved,
      policyTermMonths: params.policyTermMonths,
      distributionChannel: params.distributionChannel,
    });
  }
}
