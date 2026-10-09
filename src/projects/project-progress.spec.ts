import { PROJECT_STAGES } from '../common/constants/enums';
import { clampPercent, computeProgress, devAverage } from './project-progress';

describe('computeProgress', () => {
  const zero = { requirement: 0, ui: 0, frontend: 0, backend: 0 };

  it.each([
    ['INITIATE', 5],
    ['STARTED', 12],
    ['TESTING', 65],
    ['CLOUD_SETUP', 72],
    ['SERVER_SETUP', 79],
    ['CONFIRMATION_TESTING', 86],
    ['DEPLOYMENT', 92],
    ['CLIENT_CONFIRMATION', 97],
    ['CLOSED', 100],
  ] as const)('%s → %i%% regardless of dev tracks', (stage, expected) => {
    expect(computeProgress(stage, zero)).toBe(expected);
    expect(computeProgress(stage, { requirement: 100, ui: 100, frontend: 100, backend: 100 })).toBe(
      expected,
    );
  });

  it('IN_PROGRESS = round(12 + avg(tracks) × 0.53)', () => {
    expect(computeProgress('IN_PROGRESS', zero)).toBe(12);
    expect(
      computeProgress('IN_PROGRESS', { requirement: 100, ui: 100, frontend: 100, backend: 100 }),
    ).toBe(65);
    // avg 37.5 → 12 + 19.875 = 31.875 → 32
    expect(
      computeProgress('IN_PROGRESS', { requirement: 100, ui: 50, frontend: 0, backend: 0 }),
    ).toBe(32);
    // avg 73.75 → 12 + 39.0875 → 51
    expect(
      computeProgress('IN_PROGRESS', { requirement: 100, ui: 80, frontend: 55, backend: 60 }),
    ).toBe(51);
  });

  it('treats frontend and backend as independent tracks', () => {
    const feOnly = computeProgress('IN_PROGRESS', { ...zero, frontend: 100 });
    const beOnly = computeProgress('IN_PROGRESS', { ...zero, backend: 100 });
    expect(feOnly).toBe(beOnly);
    expect(feOnly).toBe(Math.round(12 + 25 * 0.53));
  });

  it('handles missing/out-of-range track values defensively', () => {
    expect(computeProgress('IN_PROGRESS', undefined)).toBe(12);
    expect(computeProgress('IN_PROGRESS', { requirement: 250, ui: -10 })).toBe(
      Math.round(12 + 25 * 0.53),
    );
  });

  it('is monotonic along the stage order', () => {
    const full = { requirement: 100, ui: 100, frontend: 100, backend: 100 };
    const values = PROJECT_STAGES.map((s) => computeProgress(s, s === 'IN_PROGRESS' ? full : zero));
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});

describe('clampPercent / devAverage', () => {
  it('clamps and rounds', () => {
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(101)).toBe(100);
    expect(clampPercent(49.6)).toBe(50);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it('averages four tracks', () => {
    expect(devAverage({ requirement: 100, ui: 0, frontend: 50, backend: 50 })).toBe(50);
  });
});
