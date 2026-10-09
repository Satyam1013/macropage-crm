import type { ExpenseCategory } from '../common/constants/enums';
import { toDateOnly, toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import type { Expense } from './schemas/expense.schema';

export interface ExpenseResponse {
  id: string;
  projectId: string | null;
  projectName?: string | null;
  /** Staff id the expense belongs to (`staffId`). */
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
  names?: { projects?: Map<string, string>; staff?: Map<string, string> },
): ExpenseResponse {
  const projectId = idOf(e.projectId);
  const userId = idOf(e.staffId);
  return {
    id: idOf(e._id)!,
    projectId,
    ...(names?.projects
      ? { projectName: (projectId && names.projects.get(projectId)) || null }
      : {}),
    userId,
    ...(names?.staff ? { userName: (userId && names.staff.get(userId)) || null } : {}),
    category: e.category,
    amount: e.amount,
    date: toDateOnly(e.spentOn),
    note: e.note ?? null,
    createdAt: toIso(e.createdAt),
  };
}
