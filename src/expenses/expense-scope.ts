import type { ExpenseScope } from '../common/constants/enums';

export interface ExpenseTarget {
  projectId?: unknown;
  internalProjectId?: unknown;
  staffId?: unknown;
}

/**
 * Which ids each scope requires (✓) or forbids (✗); staff is optional for COMPANY / OWNER.
 *   PROJECT           projectId ✓  internalProjectId ✗  staffId ✓
 *   INTERNAL_PROJECT  projectId ✗  internalProjectId ✓  staffId ✓
 *   COMPANY / OWNER   projectId ✗  internalProjectId ✗  staffId optional
 * Returns the first problem, or null when the combination is valid.
 */
export function expenseScopeError(scope: ExpenseScope, t: ExpenseTarget): string | null {
  const needsProject = scope === 'PROJECT';
  const needsInternal = scope === 'INTERNAL_PROJECT';
  if (needsProject && !t.projectId) return 'projectId is required when scope is PROJECT';
  if (!needsProject && t.projectId) return `projectId must be empty when scope is ${scope}`;
  if (needsInternal && !t.internalProjectId) {
    return 'internalProjectId is required when scope is INTERNAL_PROJECT';
  }
  if (!needsInternal && t.internalProjectId) {
    return `internalProjectId must be empty when scope is ${scope}`;
  }
  if ((needsProject || needsInternal) && !t.staffId) {
    return `staffId is required when scope is ${scope}`;
  }
  return null;
}

/** Backward compatibility: a batch without `scope` is inferred from the id it carries. */
export function inferExpenseScope(t: ExpenseTarget): ExpenseScope | null {
  if (t.internalProjectId) return 'INTERNAL_PROJECT';
  if (t.projectId) return 'PROJECT';
  return null;
}

/** Mongo expression for an expense's scope, valid for rows written before `scope` existed. */
export const SCOPE_EXPR = {
  $ifNull: [
    '$scope',
    {
      $cond: [
        { $eq: [{ $type: '$internalProjectId' }, 'objectId'] },
        'INTERNAL_PROJECT',
        'PROJECT',
      ],
    },
  ],
};

/** Filter (find or $match) on scope that also matches rows written before `scope` existed. */
export function scopeFilter(scope: ExpenseScope): Record<string, unknown> {
  return { $expr: { $eq: [SCOPE_EXPR, scope] } };
}
