import type { InternalProjectStatus } from '../common/constants/enums';
import { toDateOnly, toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import type { InternalProject } from './schemas/internal-project.schema';

export interface InternalProjectResponse {
  id: string;
  name: string;
  description: string | null;
  status: InternalProjectStatus;
  budget: number | null;
  /** YYYY-MM-DD */
  startDate: string | null;
  endDate: string | null;
  /** Sum of the project's expenses. */
  spent: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export function toInternalProjectResponse(
  p: InternalProject,
  spent: number,
): InternalProjectResponse {
  return {
    id: idOf(p._id)!,
    name: p.name,
    description: p.description ?? null,
    status: p.status,
    budget: p.budget ?? null,
    startDate: toDateOnly(p.startDate),
    endDate: toDateOnly(p.endDate),
    spent,
    createdAt: toIso(p.createdAt),
    updatedAt: toIso(p.updatedAt),
  };
}
