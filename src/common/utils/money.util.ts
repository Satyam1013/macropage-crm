/** Rounds to 2 decimals, avoiding binary floating point drift (e.g. 1.005 → 1.01). */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
