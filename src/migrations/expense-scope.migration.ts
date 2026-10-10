import type { Connection } from 'mongoose';
import { Expense } from '../expenses/schemas/expense.schema';

export interface ExpenseScopeReport {
  /** Rows without `scope` that get INTERNAL_PROJECT (internalProjectId set). */
  internalProject: number;
  /** Rows without `scope` that get PROJECT. */
  project: number;
}

/**
 * Backfills Expense.scope on rows written before it existed (soft-deleted rows included):
 * internalProjectId set → INTERNAL_PROJECT, otherwise PROJECT. staffId needs no change (a
 * missing value reads as null). Also creates the new `{scope, spentOn}` index.
 *
 * Idempotent. Reads already work without it (see SCOPE_EXPR); this makes the data explicit.
 */
export async function migrateExpenseScope(
  connection: Connection,
  opts: { apply: boolean },
): Promise<ExpenseScopeReport> {
  const expenses = connection.collection('expenses');
  const missing = { scope: { $exists: false } };
  const internal = { ...missing, internalProjectId: { $type: 'objectId' } };
  const report: ExpenseScopeReport = {
    internalProject: await expenses.countDocuments(internal),
    project: 0,
  };
  report.project = (await expenses.countDocuments(missing)) - report.internalProject;
  if (!opts.apply) return report;

  await expenses.updateMany(internal, { $set: { scope: 'INTERNAL_PROJECT' } });
  await expenses.updateMany(missing, { $set: { scope: 'PROJECT' } });
  await connection.model(Expense.name).createIndexes();
  return report;
}
