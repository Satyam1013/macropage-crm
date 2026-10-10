import type { ExpenseCategory, ExpenseScope } from '../common/constants/enums';
import { toDateOnly, toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import type { Expense } from './schemas/expense.schema';

export interface ExpenseResponse {
  id: string;
  scope: ExpenseScope;
  /** Client project; null for an internal expense. */
  projectId: string | null;
  projectName?: string | null;
  /** Internal project; null for a client-project expense. */
  internalProjectId: string | null;
  internalProjectName?: string | null;
  /** Staff id the expense belongs to; null when none (COMPANY / OWNER only). */
  staffId: string | null;
  /** Same as staffId (frontend alias). */
  userId: string | null;
  userName?: string | null;
  category: ExpenseCategory;
  amount: number;
  /** `spentOn` as YYYY-MM-DD. */
  date: string | null;
  note: string | null;
  createdAt: string | null;
}

export function toExpenseResponse(
  e: Expense,
  names?: {
    projects?: Map<string, string>;
    internalProjects?: Map<string, string>;
    staff?: Map<string, string>;
  },
): ExpenseResponse {
  const projectId = idOf(e.projectId);
  const internalProjectId = idOf(e.internalProjectId);
  const userId = idOf(e.staffId);
  return {
    id: idOf(e._id)!,
    // Rows written before `scope` existed (see the expense-scope migration).
    scope: e.scope ?? (internalProjectId ? 'INTERNAL_PROJECT' : 'PROJECT'),
    projectId,
    ...(names?.projects
      ? { projectName: (projectId && names.projects.get(projectId)) || null }
      : {}),
    internalProjectId,
    ...(names?.internalProjects
      ? {
          internalProjectName:
            (internalProjectId && names.internalProjects.get(internalProjectId)) || null,
        }
      : {}),
    staffId: userId,
    userId,
    ...(names?.staff ? { userName: (userId && names.staff.get(userId)) || null } : {}),
    category: e.category,
    amount: e.amount,
    date: toDateOnly(e.spentOn),
    note: e.note ?? null,
    createdAt: toIso(e.createdAt),
  };
}
