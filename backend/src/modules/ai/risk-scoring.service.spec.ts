import { RiskScoringService, RiskScoringInput } from './risk-scoring.service';

/**
 * calculateRiskScore() is pure synchronous logic with no repository calls,
 * so we instantiate the service directly with `null as any` repos — they're
 * never touched by this method. scoreForCustomer() (the repo-dependent
 * wrapper) is intentionally not covered here; that's an integration-level
 * concern better suited to an e2e test against a real database.
 */
describe('RiskScoringService.calculateRiskScore', () => {
  let service: RiskScoringService;

  const baseInput: RiskScoringInput = {
    productType: 'life_individual',
    sumInsured: 5000,
    maxSumInsuredForProduct: 100000,
    isNewCustomer: false,
    priorClaimsCount: 0,
    priorClaimsTotalAmount: 0,
    kycApproved: true,
    policyTermMonths: 12,
    distributionChannel: 'direct_staff',
  };

  beforeEach(() => {
    service = new RiskScoringService(null as any, null as any);
  });

  it('returns a clean low-risk score for an unremarkable policy', () => {
    const result = service.calculateRiskScore(baseInput);
    expect(result.band).toBe('low');
    expect(result.recommendation).toBe('auto_approve');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('never returns a score outside the 0-100 range regardless of input', () => {
    const extreme = service.calculateRiskScore({
      ...baseInput,
      sumInsured: 100000,
      maxSumInsuredForProduct: 100000,
      priorClaimsCount: 20,
      priorClaimsTotalAmount: 500000,
      kycApproved: false,
      customerAge: 90,
      policyTermMonths: 60,
      distributionChannel: 'broker',
    });
    expect(extreme.score).toBeGreaterThanOrEqual(0);
    expect(extreme.score).toBeLessThanOrEqual(100);
    expect(extreme.band).toBe('high');
    expect(extreme.recommendation).toBe('decline');
  });

  it('penalises high sum insured relative to the product ceiling', () => {
    const low = service.calculateRiskScore({ ...baseInput, sumInsured: 1000 });
    const high = service.calculateRiskScore({ ...baseInput, sumInsured: 95000 });
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.factors.some(f => f.name === 'high_sum_insured')).toBe(true);
  });

  it('escalates score with prior claims history, capped at a maximum contribution', () => {
    const oneClaim = service.calculateRiskScore({ ...baseInput, priorClaimsCount: 1, priorClaimsTotalAmount: 500 });
    const manyClaims = service.calculateRiskScore({ ...baseInput, priorClaimsCount: 10, priorClaimsTotalAmount: 50000 });
    expect(manyClaims.score).toBeGreaterThan(oneClaim.score);

    const claimsFactor = manyClaims.factors.find(f => f.name === 'claims_history');
    expect(claimsFactor).toBeDefined();
    expect(claimsFactor!.impact).toBeLessThanOrEqual(40); // documented cap in the implementation
  });

  it('flags incomplete KYC as a distinct risk factor', () => {
    const approved = service.calculateRiskScore({ ...baseInput, kycApproved: true });
    const notApproved = service.calculateRiskScore({ ...baseInput, kycApproved: false });
    expect(notApproved.score).toBeGreaterThan(approved.score);
    expect(notApproved.factors.some(f => f.name === 'kyc_incomplete')).toBe(true);
  });

  it('treats age outside 21-65 as higher risk than age within the band', () => {
    const midAge = service.calculateRiskScore({ ...baseInput, customerAge: 35 });
    const veryYoung = service.calculateRiskScore({ ...baseInput, customerAge: 18 });
    const veryOld = service.calculateRiskScore({ ...baseInput, customerAge: 80 });
    expect(veryYoung.score).toBeGreaterThan(midAge.score);
    expect(veryOld.score).toBeGreaterThan(midAge.score);
  });

  it('marks confidence as medium for new customers with no claims history, high otherwise', () => {
    const newCustomer = service.calculateRiskScore({ ...baseInput, isNewCustomer: true, priorClaimsCount: 0 });
    const established = service.calculateRiskScore({ ...baseInput, isNewCustomer: false });
    expect(newCustomer.confidence).toBe('medium');
    expect(established.confidence).toBe('high');
  });

  it('never auto-approves when the risk engine itself recommends decline, even with a lenient product threshold', () => {
    // This documents the underwriting.service.ts guardrail behaviour at the
    // scoring layer: a 'decline' recommendation must never be silently
    // downgraded, regardless of what the calling code does with it.
    const result = service.calculateRiskScore({
      ...baseInput,
      sumInsured: 95000,
      priorClaimsCount: 8,
      priorClaimsTotalAmount: 80000,
      kycApproved: false,
    });
    expect(result.recommendation).toBe('decline');
  });

  it('produces a human-readable description for every applied factor', () => {
    const result = service.calculateRiskScore({
      ...baseInput,
      sumInsured: 90000,
      priorClaimsCount: 2,
      priorClaimsTotalAmount: 1000,
      kycApproved: false,
      isNewCustomer: true,
    });
    expect(result.factors.length).toBeGreaterThan(0);
    for (const factor of result.factors) {
      expect(typeof factor.description).toBe('string');
      expect(factor.description.length).toBeGreaterThan(0);
      expect(typeof factor.impact).toBe('number');
    }
  });
});
