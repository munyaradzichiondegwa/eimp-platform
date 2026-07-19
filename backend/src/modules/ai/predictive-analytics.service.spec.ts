import { PredictiveAnalyticsService } from './predictive-analytics.service';

function buildMockRepos(overrides: { failedPayments?: number; customerClaims?: number; priorLapses?: number } = {}) {
  const policyRepo = { count: jest.fn().mockResolvedValue(overrides.priorLapses ?? 0) };
  const claimRepo = { count: jest.fn().mockResolvedValue(overrides.customerClaims ?? 0) };
  const paymentRepo = { count: jest.fn().mockResolvedValue(overrides.failedPayments ?? 0) };
  return { policyRepo, claimRepo, paymentRepo };
}

function makePolicy(overrides: Record<string, any> = {}) {
  return {
    id: 'policy-1',
    policyNumber: 'EBA-POL-2026-000001',
    customerId: 'customer-1',
    outstandingPremium: 0,
    ...overrides,
  } as any;
}

describe('PredictiveAnalyticsService.calculateLapseRisk', () => {
  it('scores a clean policy at the base score with recommendedAction "none"', async () => {
    const { policyRepo, claimRepo, paymentRepo } = buildMockRepos();
    const service = new PredictiveAnalyticsService(policyRepo as any, claimRepo as any, paymentRepo as any);

    const result = await service.calculateLapseRisk(makePolicy());

    expect(result.lapseRiskScore).toBe(15);
    expect(result.recommendedAction).toBe('none');
    expect(result.factors).toHaveLength(0);
  });

  it('combines all four factors correctly (hand-verified: 15+12+16+20+15=78)', async () => {
    const { policyRepo, claimRepo, paymentRepo } = buildMockRepos({
      failedPayments: 1,
      customerClaims: 2,
      priorLapses: 1,
    });
    const service = new PredictiveAnalyticsService(policyRepo as any, claimRepo as any, paymentRepo as any);

    const result = await service.calculateLapseRisk(makePolicy({ outstandingPremium: 500 }));

    expect(result.lapseRiskScore).toBe(78);
    expect(result.renewalProbability).toBe(32);
    expect(result.recommendedAction).toBe('priority_outreach');
    expect(result.factors).toHaveLength(4);
  });

  it('caps every factor at its documented maximum contribution and the total score at 100', async () => {
    const { policyRepo, claimRepo, paymentRepo } = buildMockRepos({
      failedPayments: 10,
      customerClaims: 10,
      priorLapses: 5,
    });
    const service = new PredictiveAnalyticsService(policyRepo as any, claimRepo as any, paymentRepo as any);

    const result = await service.calculateLapseRisk(makePolicy({ outstandingPremium: 1000 }));

    expect(result.lapseRiskScore).toBe(100);
    expect(result.renewalProbability).toBe(10);
    expect(result.recommendedAction).toBe('priority_outreach');

    const paymentFactor = result.factors.find(f => f.name === 'payment_failures');
    const claimsFactor = result.factors.find(f => f.name === 'claims_activity');
    const lapseFactor = result.factors.find(f => f.name === 'prior_lapse_history');
    expect(paymentFactor!.impact).toBe(30);
    expect(claimsFactor!.impact).toBe(20);
    expect(lapseFactor!.impact).toBe(35);
  });

  it('flags outstanding premium as its own independent factor', async () => {
    const { policyRepo, claimRepo, paymentRepo } = buildMockRepos();
    const service = new PredictiveAnalyticsService(policyRepo as any, claimRepo as any, paymentRepo as any);

    const result = await service.calculateLapseRisk(makePolicy({ outstandingPremium: 250.5 }));

    expect(result.lapseRiskScore).toBe(30);
    const factor = result.factors.find(f => f.name === 'outstanding_premium');
    expect(factor).toBeDefined();
    expect(factor!.description).toContain('250.50');
  });

  it('crosses the standard_reminder threshold (35) but not priority_outreach (60) in the mid range', async () => {
    const { policyRepo, claimRepo, paymentRepo } = buildMockRepos({ customerClaims: 3 });
    const service = new PredictiveAnalyticsService(policyRepo as any, claimRepo as any, paymentRepo as any);

    const result = await service.calculateLapseRisk(makePolicy());

    expect(result.lapseRiskScore).toBe(35);
    expect(result.recommendedAction).toBe('standard_reminder');
  });

  it('preserves policyId and policyNumber from the input policy on the result', async () => {
    const { policyRepo, claimRepo, paymentRepo } = buildMockRepos();
    const service = new PredictiveAnalyticsService(policyRepo as any, claimRepo as any, paymentRepo as any);

    const result = await service.calculateLapseRisk(makePolicy({ id: 'abc-123', policyNumber: 'EBA-POL-2026-000042' }));

    expect(result.policyId).toBe('abc-123');
    expect(result.policyNumber).toBe('EBA-POL-2026-000042');
  });
});
