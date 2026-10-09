import { Types } from 'mongoose';
import type { ProjectStage } from '../../src/common/constants/enums';
import { Expense } from '../../src/expenses/schemas/expense.schema';
import { Lead } from '../../src/leads/schemas/lead.schema';
import { Payment } from '../../src/payments/schemas/payment.schema';
import { Project } from '../../src/projects/schemas/project.schema';
import type { TestContext } from './test-app';

export const utcDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Inserts a WON lead + its project directly (bypassing the API) for read-side tests. */
export async function makeProject(
  ctx: TestContext,
  opts: {
    customerId: string;
    ownerId: string;
    by: string;
    name?: string;
    stage?: ProjectStage;
    contractValue?: number;
    team?: string[];
    clientApproved?: boolean;
  },
): Promise<string> {
  const leadId = new Types.ObjectId();
  const projectId = new Types.ObjectId();
  const stage = opts.stage ?? 'IN_PROGRESS';
  await ctx.model<Lead>(Lead.name).create({
    _id: leadId,
    title: opts.name ?? 'Project',
    company: 'Co',
    ownerId: opts.ownerId,
    stage: 'WON',
    value: opts.contractValue ?? 100000,
    projectId,
    customerId: opts.customerId,
    wonAt: new Date(),
  });
  await ctx.model<Project>(Project.name).create({
    _id: projectId,
    leadId,
    customerId: opts.customerId,
    name: opts.name ?? 'Project',
    description: 'desc',
    requirements: 'reqs',
    stage,
    startDate: utcDate('2026-01-01'),
    endDate: utcDate('2026-12-31'),
    contractValue: opts.contractValue ?? 100000,
    dev: { requirement: 100, ui: 50, frontend: 20, backend: 30 },
    team: opts.team ?? [],
    clientApproved: opts.clientApproved ?? false,
    stageHistory: [{ from: null, to: stage, by: opts.by, at: new Date() }],
  });
  return projectId.toHexString();
}

export async function addPayment(
  ctx: TestContext,
  projectId: string,
  amount: number,
  paidOn: string,
  deleted = false,
) {
  return ctx.model<Payment>(Payment.name).create({
    projectId,
    amount,
    paidOn: utcDate(paidOn),
    mode: 'BANK_TRANSFER',
    deletedAt: deleted ? new Date() : null,
  });
}

export async function addExpense(
  ctx: TestContext,
  projectId: string,
  staffId: string,
  category: Expense['category'],
  amount: number,
  spentOn: string,
  deleted = false,
) {
  return ctx.model<Expense>(Expense.name).create({
    projectId,
    staffId,
    category,
    amount,
    spentOn: utcDate(spentOn),
    deletedAt: deleted ? new Date() : null,
  });
}
