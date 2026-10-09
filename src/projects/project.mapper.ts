import type { ProjectStage } from '../common/constants/enums';
import { toDateOnly, toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import { computeProgress, DevTracks } from './project-progress';
import type { Project } from './schemas/project.schema';

export interface ProjectResponse {
  id: string;
  leadId: string | null;
  name: string;
  clientName: string | null;
  customerId: string | null;
  description: string;
  requirements: string;
  stage: ProjectStage;
  startDate: string | null;
  endDate: string | null;
  contractValue: number;
  dev: DevTracks;
  team: string[];
  clientApproved: boolean;
  clientNote: string | null;
  createdAt: string | null;
  closedAt: string | null;
  progress: number;
}

export interface StageHistoryResponse {
  from: string | null;
  to: string;
  by: string | null;
  byName?: string | null;
  at: string | null;
}

export function toDev(dev: Partial<DevTracks> | null | undefined): DevTracks {
  return {
    requirement: dev?.requirement ?? 0,
    ui: dev?.ui ?? 0,
    frontend: dev?.frontend ?? 0,
    backend: dev?.backend ?? 0,
  };
}

export function toProjectResponse(p: Project, clientName: string | null = null): ProjectResponse {
  return {
    id: idOf(p._id)!,
    leadId: idOf(p.leadId),
    name: p.name,
    clientName,
    customerId: idOf(p.customerId),
    description: p.description ?? '',
    requirements: p.requirements ?? '',
    stage: p.stage,
    startDate: toDateOnly(p.startDate),
    endDate: toDateOnly(p.endDate),
    contractValue: p.contractValue,
    dev: toDev(p.dev),
    team: (p.team ?? []).map((t) => idOf(t)!),
    clientApproved: !!p.clientApproved,
    clientNote: p.clientNote ?? null,
    createdAt: toIso(p.createdAt),
    closedAt: toIso(p.closedAt),
    progress: computeProgress(p.stage, p.dev),
  };
}

export function toStageHistory(
  entries: { from?: string | null; to: string; by?: unknown; at?: Date | null }[] | undefined,
  names?: Map<string, string>,
): StageHistoryResponse[] {
  return (entries ?? []).map((h) => {
    const by = idOf(h.by as string);
    return {
      from: h.from ?? null,
      to: h.to,
      by,
      ...(names ? { byName: (by && names.get(by)) || null } : {}),
      at: toIso(h.at),
    };
  });
}
