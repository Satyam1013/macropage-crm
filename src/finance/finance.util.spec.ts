import { computeFinance } from './finance.util';

describe('computeFinance', () => {
  it('applies the documented formulas', () => {
    expect(computeFinance({ contract: 100000, received: 40000, spent: 25000 })).toEqual({
      contract: 100000,
      received: 40000,
      pending: 60000,
      spent: 25000,
      net: 15000,
      projected: 75000,
      margin: 75,
    });
  });

  it('never reports negative pending when overpaid', () => {
    expect(computeFinance({ contract: 1000, received: 1200, spent: 0 }).pending).toBe(0);
  });

  it('allows negative net/projected (loss) and margin', () => {
    const f = computeFinance({ contract: 1000, received: 100, spent: 1500 });
    expect(f.net).toBe(-1400);
    expect(f.projected).toBe(-500);
    expect(f.margin).toBe(-50);
  });

  it('margin is 0 when there is no contract value', () => {
    expect(computeFinance({ contract: 0, received: 0, spent: 500 }).margin).toBe(0);
  });

  it('rounds money to 2 decimals', () => {
    const f = computeFinance({ contract: 0.1 + 0.2, received: 0.1, spent: 0 });
    expect(f.contract).toBe(0.3);
    expect(f.pending).toBe(0.2);
  });
});
