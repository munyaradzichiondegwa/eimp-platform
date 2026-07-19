import { FraudDetectionService } from './fraud-detection.service';

/**
 * scoreClaim() always runs every rule in sequence (statistical outlier,
 * round-number, time-to-claim, velocity, network), so every test needs a
 * fully-stubbed query builder even when only one rule is under test -
 * otherwise an unconfigured chain method throws instead of resolving. The
 * helper below returns safe "nothing happened" defaults (0 counts, empty
 * stats) that individual tests override via mockResolvedValueOnce.
 */
function buildMockClaimRepo() {
  const qb: any = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  return { createQueryBuilder: jest.fn(() => qb), __qb: qb };
}

function makeClaim(overrides: Record<string, any> = {}) {
  return {
    id: 'claim-1',
    policyId: 'policy-1',
    customerId: 'customer-1',
    claimedAmount: 100,
    eventDate: '2026-06-15',
    policy: { productId: 'product-1', startDate: '2026-01-01' },
    ...overrides,
  } as any;
}

describe('FraudDetectionService.scoreClaim', () => {
  it('scores a routine, well-aged, non-round claim as proceed with no flags', async () => {
    const repo = buildMockClaimRepo();
    const service = new FraudDetectionService(repo as any);

    const result = await service.scoreClaim(makeClaim({ claimedAmount: 137, eventDate: '2026-06-15' }));

    expect(result.flagged).toBe(false);
    expect(result.recommendation).toBe('proceed');
    expect(result.flags).toHaveLength(0);
  });

  it('flags a round-number claim amount at or above 1000', async () => {
    const repo = buildMockClaimRepo();
    const service = new FraudDetectionService(repo as any);

    const result = await service.scoreClaim(makeClaim({ claimedAmount: 5000, eventDate: '2026-06-15' }));

    expect(result.flags.some(f => f.rule === 'round_number')).toBe(true);
  });

  it('does NOT flag round numbers under the 1000 threshold', async () => {
    const repo = buildMockClaimRepo();
    const service = new FraudDetectionService(repo as any);

    const result = await service.scoreClaim(makeClaim({ claimedAmount: 500, eventDate: '2026-06-15' }));

    expect(result.flags.some(f => f.rule === 'round_number')).toBe(false);
  });

  it('applies the heaviest penalty for a claim within 7 days of policy inception', async () => {
    const repo = buildMockClaimRepo();
    const service = new FraudDetectionService(repo as any);

    const result = await service.scoreClaim(makeClaim({
      claimedAmount: 137,
      policy: { productId: 'product-1', startDate: '2026-06-10' },
      eventDate: '2026-06-14',
    }));

    const flag = result.flags.find(f => f.rule === 'immediate_claim');
    expect(flag).toBeDefined();
    expect(flag!.weight).toBe(35);
  });

  it('applies a graduated (smaller) penalty for a claim 30-60 days after inception', async () => {
    const repo = buildMockClaimRepo();
    const service = new FraudDetectionService(repo as any);

    const result = await service.scoreClaim(makeClaim({
      claimedAmount: 137,
      policy: { productId: 'product-1', startDate: '2026-04-01' },
      eventDate: '2026-05-15',
    }));

    const flag = result.flags.find(f => f.rule === 'moderately_early_claim');
    expect(flag).toBeDefined();
    expect(flag!.weight).toBe(8);
  });

  it('does not penalise time-to-claim once past the 60-day window', async () => {
    const repo = buildMockClaimRepo();
    const service = new FraudDetectionService(repo as any);

    const result = await service.scoreClaim(makeClaim({
      claimedAmount: 137,
      policy: { productId: 'product-1', startDate: '2026-01-01' },
      eventDate: '2026-06-15',
    }));

    expect(result.flags.some(f =>
      ['immediate_claim', 'early_claim', 'moderately_early_claim'].includes(f.rule),
    )).toBe(false);
  });

  it('flags claim velocity when other claims exist on the same policy within 90 days', async () => {
    const repo = buildMockClaimRepo();
    repo.__qb.getCount.mockResolvedValueOnce(2);
    const service = new FraudDetectionService(repo as any);

    const result = await service.scoreClaim(makeClaim({ claimedAmount: 137, eventDate: '2026-06-15' }));

    const flag = result.flags.find(f => f.rule === 'claim_velocity');
    expect(flag).toBeDefined();
    expect(flag!.weight).toBe(30);
  });

  it('flags multi-policy claimant activity when the customer has 2+ other recent claims', async () => {
    const repo = buildMockClaimRepo();
    repo.__qb.getCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);
    const service = new FraudDetectionService(repo as any);

    const result = await service.scoreClaim(makeClaim({ claimedAmount: 137, eventDate: '2026-06-15' }));

    expect(result.flags.some(f => f.rule === 'multi_policy_claimant')).toBe(true);
  });

  it('escalates recommendation from proceed to manual_review to investigate as score rises', async () => {
    const repo = buildMockClaimRepo();
    repo.__qb.getCount
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);
    const service = new FraudDetectionService(repo as any);

    const result = await service.scoreClaim(makeClaim({
      claimedAmount: 5000,
      policy: { productId: 'product-1', startDate: '2026-06-10' },
      eventDate: '2026-06-12',
    }));

    expect(result.score).toBe(90);
    expect(result.recommendation).toBe('investigate');
    expect(result.flagged).toBe(true);
  });

  it('caps the total score at 100 even when combined rule weights exceed it', async () => {
    const repo = buildMockClaimRepo();
    repo.__qb.getCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(5);
    repo.__qb.getRawMany.mockResolvedValueOnce(
      Array.from({ length: 10 }, () => ({ claimedAmount: '100' })),
    );
    const service = new FraudDetectionService(repo as any);

    const result = await service.scoreClaim(makeClaim({
      claimedAmount: 100000,
      policy: { productId: 'product-1', startDate: '2026-06-10' },
      eventDate: '2026-06-11',
    }));

    expect(result.score).toBeLessThanOrEqual(100);
  });
});
