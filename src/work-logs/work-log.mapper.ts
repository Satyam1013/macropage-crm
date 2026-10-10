import type { WorkLogScope, WorkLogStatus } from '../common/constants/enums';
import { toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import type { WorkLog } from './schemas/work-log.schema';

export interface WorkLogResponse {
  id: string;
  scope: WorkLogScope;
  projectId: string | null;
  leadId: string | null;
  staffId: string;
  type: string;
  note: string;
  status: WorkLogStatus;
  /** Project name (PROJECT scope) or lead title (LEAD scope). */
  targetName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Staff list entry: a non-DONE log, without staff id or note. */
export type CurrentWorkResponse = Pick<
  WorkLogResponse,
  'id' | 'scope' | 'type' | 'status' | 'projectId' | 'leadId' | 'targetName'
>;

export function toWorkLogResponse(w: WorkLog, targetName: string | null): WorkLogResponse {
  return {
    id: idOf(w._id)!,
    scope: w.scope,
    projectId: idOf(w.projectId),
    leadId: idOf(w.leadId),
    staffId: idOf(w.staffId)!,
    type: w.type,
    note: w.note ?? '',
    status: w.status,
    targetName,
    createdAt: toIso(w.createdAt),
    updatedAt: toIso(w.updatedAt),
  };
}

export function toCurrentWork(w: WorkLogResponse): CurrentWorkResponse {
  const { id, scope, type, status, projectId, leadId, targetName } = w;
  return { id, scope, type, status, projectId, leadId, targetName };
}
