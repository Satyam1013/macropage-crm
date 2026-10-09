import type { LeadStage } from '../common/constants/enums';
import { toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import type { Lead } from '../leads/schemas/lead.schema';

/** The 9 funnel stages before WON; progress is the stage's position in this list. */
export const DISCUSSION_STAGES: LeadStage[] = [
  'LEAD',
  'IDENTIFIED',
  'GENERATED',
  'QUALIFIED',
  'DEMO',
  'PROPOSAL',
  'NEGOTIATION',
  'VERBAL',
  'PENDING',
];

export type DiscussionStatus = 'ACTIVE' | 'CLOSED';

/**
 * Customer-facing view of a lead. Built field by field from a whitelist: notes, source, owner,
 * contact details, expected close, customer/project ids and history `by`/`from` never appear.
 */
export interface DiscussionResponse {
  id: string;
  title: string;
  stage: LeadStage;
  status: DiscussionStatus;
  stageProgress: number;
  lastUpdatedAt: string | null;
  timeline: { stage: LeadStage; at: string | null }[];
  value?: number;
}

type DiscussionSource = Pick<
  Lead,
  '_id' | 'title' | 'stage' | 'value' | 'showValueToClient' | 'stageHistory' | 'createdAt'
>;

function progressOf(stage: LeadStage): number | null {
  const i = DISCUSSION_STAGES.indexOf(stage);
  return i < 0 ? null : Math.round((i / (DISCUSSION_STAGES.length - 1)) * 100);
}

/** For CANCELLED leads: progress of the last funnel stage reached before closing. */
function lastKnownProgress(lead: DiscussionSource): number {
  for (const entry of [...(lead.stageHistory ?? [])].reverse()) {
    for (const stage of [entry.to, entry.from]) {
      const p = stage ? progressOf(stage) : null;
      if (p !== null) return p;
    }
  }
  return 0;
}

export function toDiscussionResponse(lead: DiscussionSource): DiscussionResponse {
  const history = [...(lead.stageHistory ?? [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
  const closed = lead.stage === 'CANCELLED';
  const out: DiscussionResponse = {
    id: idOf(lead._id)!,
    title: lead.title,
    stage: lead.stage,
    status: closed ? 'CLOSED' : 'ACTIVE',
    stageProgress: closed ? lastKnownProgress(lead) : (progressOf(lead.stage) ?? 0),
    lastUpdatedAt: toIso(history[0]?.at ?? lead.createdAt),
    timeline: history.map((h) => ({ stage: h.to, at: toIso(h.at) })),
  };
  if (lead.showValueToClient) out.value = lead.value;
  return out;
}
