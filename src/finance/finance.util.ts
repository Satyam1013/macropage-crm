import { round2 } from '../common/utils/money.util';

export interface FinanceInputs {
  contract: number;
  received: number;
  spent: number;
}

export interface FinanceBlock {
  contract: number;
  received: number;
  pending: number;
  spent: number;
  net: number;
  projected: number;
  margin: number;
}

/**
 * Derived per-project finance (never stored):
 *   pending   = max(contract - received, 0)
 *   net       = received - spent        (cash earned so far)
 *   projected = contract - spent        (profit once fully paid)
 *   margin    = contract ? round((contract - spent) / contract × 100) : 0
 */
export function computeFinance({ contract, received, spent }: FinanceInputs): FinanceBlock {
  const c = round2(contract);
  const r = round2(received);
  const s = round2(spent);
  return {
    contract: c,
    received: r,
    pending: round2(Math.max(c - r, 0)),
    spent: s,
    net: round2(r - s),
    projected: round2(c - s),
    margin: c ? Math.round(((c - s) / c) * 100) : 0,
  };
}
