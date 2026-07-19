import { ForecastingService } from './forecasting.service';

/**
 * buildForecast() is private pure-math logic (ordinary least-squares linear
 * regression) with no repository dependency - accessed here via bracket
 * notation, a standard pattern for unit-testing a private method that has
 * no public pure-function equivalent. Expected values below were hand
 * calculated independently against the documented formula (y = a + bx
 * fitted by OLS) before being pasted in, specifically so this test can
 * catch a regression in the math itself, not just mirror whatever the
 * implementation currently produces.
 */
describe('ForecastingService.buildForecast', () => {
  let service: any;

  beforeEach(() => {
    service = new ForecastingService(null as any, null as any);
  });

  it('returns an empty low-confidence result when there is no historical data', () => {
    const result = service.buildForecast([], 6);
    expect(result.historical).toEqual([]);
    expect(result.forecast).toEqual([]);
    expect(result.confidence).toBe('low');
    expect(result.trend.slope).toBe(0);
  });

  it('fits a perfect linear trend correctly (hand-verified: slope=10000, intercept=10000)', () => {
    const historical = [
      { month: '2026-01', value: 10000 },
      { month: '2026-02', value: 20000 },
      { month: '2026-03', value: 30000 },
    ];
    const result = service.buildForecast(historical, 2);

    expect(result.trend.slope).toBeCloseTo(10000, 5);
    expect(result.trend.monthlyGrowthRate).toBeCloseTo(50, 5);

    expect(result.forecast[0]).toEqual({ month: '2026-04', value: 40000 });
    expect(result.forecast[1]).toEqual({ month: '2026-05', value: 50000 });
  });

  it('derives optimistic (+15%) and pessimistic (-15%) scenario bands from the base forecast', () => {
    const historical = [
      { month: '2026-01', value: 10000 },
      { month: '2026-02', value: 20000 },
      { month: '2026-03', value: 30000 },
    ];
    const result = service.buildForecast(historical, 1);

    expect(result.scenarios.optimistic[0].value).toBeCloseTo(40000 * 1.15, 2);
    expect(result.scenarios.pessimistic[0].value).toBeCloseTo(40000 * 0.85, 2);
    expect(result.scenarios.base).toEqual(result.forecast);
  });

  it('never forecasts a negative value even on a steep downward trend', () => {
    const historical = [
      { month: '2026-01', value: 1000 },
      { month: '2026-02', value: 500 },
      { month: '2026-03', value: 0 },
    ];
    const result = service.buildForecast(historical, 3);
    for (const point of result.forecast) {
      expect(point.value).toBeGreaterThanOrEqual(0);
    }
    for (const point of result.scenarios.pessimistic) {
      expect(point.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles a single data point without dividing by zero', () => {
    const historical = [{ month: '2026-01', value: 5000 }];
    const result = service.buildForecast(historical, 1);
    expect(Number.isFinite(result.trend.slope)).toBe(true);
    expect(Number.isNaN(result.forecast[0]?.value)).toBe(false);
    expect(result.forecast[0].value).toBe(5000); // slope=0 (denominator=0), flat continuation
  });

  it('reports low confidence under 4 months, medium under 9, high at 9 or more', () => {
    const makeHistorical = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, value: 1000 * (i + 1) }));

    expect(service.buildForecast(makeHistorical(3), 1).confidence).toBe('low');
    expect(service.buildForecast(makeHistorical(5), 1).confidence).toBe('medium');
    expect(service.buildForecast(makeHistorical(9), 1).confidence).toBe('high');
  });

  it('correctly rolls month strings over a year boundary', () => {
    const historical = [
      { month: '2026-11', value: 1000 },
      { month: '2026-12', value: 2000 },
    ];
    const result = service.buildForecast(historical, 2);
    expect(result.forecast[0].month).toBe('2027-01');
    expect(result.forecast[1].month).toBe('2027-02');
  });
});
