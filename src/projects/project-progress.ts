import type { ProjectStage } from '../common/constants/enums';

export interface DevTracks {
  requirement: number;
  ui: number;
  frontend: number;
  backend: number;
}

/** Fixed overall progress per stage; IN_PROGRESS is derived from the dev tracks. */
export const STAGE_PROGRESS: Record<Exclude<ProjectStage, 'IN_PROGRESS'>, number> = {
  INITIATE: 5,
  STARTED: 12,
  TESTING: 65,
  CLOUD_SETUP: 72,
  SERVER_SETUP: 79,
  CONFIRMATION_TESTING: 86,
  DEPLOYMENT: 92,
  CLIENT_CONFIRMATION: 97,
  CLOSED: 100,
};

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function devAverage(dev: Partial<DevTracks> | null | undefined): number {
  const tracks = [dev?.requirement, dev?.ui, dev?.frontend, dev?.backend].map((v) =>
    clampPercent(v ?? 0),
  );
  return tracks.reduce((a, b) => a + b, 0) / tracks.length;
}

/**
 * Overall progress %:
 * fixed per stage, except IN_PROGRESS = round(12 + average(requirement, ui, frontend, backend) × 0.53)
 * (so IN_PROGRESS spans 12 → 65, meeting STARTED and TESTING).
 */
export function computeProgress(
  stage: ProjectStage,
  dev: Partial<DevTracks> | null | undefined,
): number {
  if (stage === 'IN_PROGRESS') return Math.round(12 + devAverage(dev) * 0.53);
  return STAGE_PROGRESS[stage] ?? 0;
}
