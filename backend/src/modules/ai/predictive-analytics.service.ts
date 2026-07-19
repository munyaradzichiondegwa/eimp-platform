import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Policy, PolicyStatus } from '../underwriting/entities/policy.entity';
import { Claim } from '../claims/entities/claim.entity';
import { Payment, PaymentStatus } from '../finance/entities/payment.entity';

/**
 * PREDICTIVE ANALYTICS ENGINE - IMPLEMENTATION NOTE
 * ----------------------------------------------------------------------
 * Weighted-feature lapse/renewal scoring built from genuinely available
 * signals: payment failure history, claims ratio, prior lapse/cancellation
 * record, and time-to-renewal. This is honest statistical scoring, not a
 * trained churn model - there isn't yet enough renewal-outcome history in
 * a new system to train one responsibly. Re-fit against actual renew/lapse
 * outcomes once 2+ renewal cycles of data exist.
 */

export interface LapseRiskResult {
  policyId: string;
  policyNumber: string;
  lapseRiskScore: number;
  renewalProbability: number;
  factors: Array<{ name: string; impact: number; description: string }>;
  recommendedAction: 'none' | 'standard_reminder' | 'priority_outreach';
}

@Injectable()
export class PredictiveAnalyticsService {
  constructor(
    @InjectRepository(Policy)
    private policyRepo: Repository<Policy>,
    @InjectRepository(Claim)
    private claimRepo: Repository<Claim>,
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
  ) {}

  async calculateLapseRisk(policy: Policy): Promise<LapseRiskResult> {
    const factors: Array<{ name: string; impact: number; description: string }> = [];
    let score = 15;

    const failedPayments = await this.paymentRepo.count({
      where: { customerId: policy.customerId, status: PaymentStatus.FAILED } as any,
    });
    if (failedPayments > 0) {
      const impact = Math.min(failedPayments * 12, 30);
      score += impact;
      factors.push({ name: 'payment_failures', impact, description: `${failedPayments} failed payment attempt(s) on record` });
    }

    const customerClaims = await this.claimRepo.count({ where: { customerId: policy.customerId } });
    if (customerClaims > 0) {
      const impact = Math.min(customerClaims * 8, 20);
      score += impact;
      factors.push({ name: 'claims_activity', impact, description: `${customerClaims} claim(s) filed by this customer` });
    }

    const priorLapses = await this.policyRepo.count({
      where: [
        { customerId: policy.customerId, status: PolicyStatus.LAPSED } as any,
        { customerId: policy.customerId, status: PolicyStatus.CANCELLED } as any,
      ],
    });
    if (priorLapses > 0) {
      const impact = Math.min(priorLapses * 20, 35);
      score += impact;
      factors.push({ name: 'prior_lapse_history', impact, description: `${priorLapses} previously lapsed/cancelled policy(ies)` });
    }

    if (Number(policy.outstandingPremium) > 0) {
      const impact = 15;
      score += impact;
      factors.push({ name: 'outstanding_premium', impact, description: `USD ${Number(policy.outstandingPremium).toFixed(2)} outstanding on current term` });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const renewalProbability = Math.max(0, Math.min(100, 100 - score + 10));

    const recommendedAction = score >= 60 ? 'priority_outreach' : score >= 35 ? 'standard_reminder' : 'none';

    return {
      policyId: policy.id,
      policyNumber: policy.policyNumber,
      lapseRiskScore: score,
      renewalProbability,
      factors,
      recommendedAction,
    };
  }

  async getAtRiskRenewals(lookaheadDays = 60): Promise<LapseRiskResult[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + lookaheadDays);

    const expiringPolicies = await this.policyRepo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: PolicyStatus.ACTIVE })
      .andWhere('p.endDate <= :cutoff', { cutoff })
      .andWhere('p.endDate >= :now', { now: new Date() })
      .getMany();

    const results: LapseRiskResult[] = [];
    for (const policy of expiringPolicies) {
      results.push(await this.calculateLapseRisk(policy));
    }

    return results.sort((a, b) => b.lapseRiskScore - a.lapseRiskScore);
  }

  async estimateCustomerValue(customerId: string): Promise<{
    totalPremiumPaid: number;
    totalClaimsPaid: number;
    netValue: number;
    policyCount: number;
    tenureMonths: number;
  }> {
    const policies = await this.policyRepo.find({ where: { customerId } });
    const totalPremiumPaid = policies.reduce((s, p) => s + Number(p.grossPremium), 0);

    const claims = await this.claimRepo.find({ where: { customerId, status: 'settled' as any } });
    const totalClaimsPaid = claims.reduce((s, c) => s + Number(c.settlementAmount || 0), 0);

    const sortedPolicies = [...policies].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const earliestPolicy = sortedPolicies[0];
    const tenureMonths = earliestPolicy
      ? Math.max(1, Math.round((Date.now() - new Date(earliestPolicy.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)))
      : 0;

    return {
      totalPremiumPaid,
      totalClaimsPaid,
      netValue: totalPremiumPaid - totalClaimsPaid,
      policyCount: policies.length,
      tenureMonths,
    };
  }
}
