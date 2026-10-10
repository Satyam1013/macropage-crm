import type { LeadStage, ProjectPlan } from '../common/constants/enums';
import { toDateOnly, toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import { StageHistoryResponse, toStageHistory } from '../projects/project.mapper';
import type { Lead } from './schemas/lead.schema';

export interface LeadResponse {
  id: string;
  title: string;
  company: string;
  contactName: string;
  phone: string;
  email: string;
  source: string;
  value: number;
  /** Price per plan; null until a quotation is sent. */
  quote: Record<ProjectPlan, number> | null;
  /** Staff id of the lead owner. */
  owner: string | null;
  stage: LeadStage;
  expectedClose: string | null;
  notes: string;
  createdAt: string | null;
  wonAt: string | null;
  projectId: string | null;
  customerId: string | null;
  visibleToClient: boolean;
  showValueToClient: boolean;
  stageUpdatedAt: string | null;
}

export interface LeadDetailResponse extends LeadResponse {
  stageHistory: StageHistoryResponse[];
}

export function toLeadResponse(l: Lead): LeadResponse {
  return {
    id: idOf(l._id)!,
    title: l.title,
    company: l.company,
    contactName: l.contactName ?? '',
    phone: l.phone ?? '',
    email: l.email ?? '',
    source: l.source ?? '',
    value: l.value ?? 0,
    quote: l.quote ? { PRO: l.quote.PRO, PREMIUM: l.quote.PREMIUM } : null,
    owner: idOf(l.ownerId),
    stage: l.stage,
    expectedClose: toDateOnly(l.expectedClose),
    notes: l.notes ?? '',
    createdAt: toIso(l.createdAt),
    wonAt: toIso(l.wonAt),
    projectId: idOf(l.projectId),
    customerId: idOf(l.customerId),
    visibleToClient: !!l.visibleToClient,
    showValueToClient: !!l.showValueToClient,
    stageUpdatedAt: toIso(l.stageUpdatedAt),
  };
}

export function toLeadDetailResponse(l: Lead, names?: Map<string, string>): LeadDetailResponse {
  return { ...toLeadResponse(l), stageHistory: toStageHistory(l.stageHistory, names) };
}
