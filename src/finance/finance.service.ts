import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, PipelineStage } from 'mongoose';
import type { ExpenseCategory, ExpenseScope, ProjectStage } from '../common/constants/enums';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { monthKey, startOfUtcMonth } from '../common/utils/date.util';
import { dateRange } from '../common/utils/date-range.util';
import { round2 } from '../common/utils/money.util';
import { idOf, toObjectId } from '../common/utils/object-id.util';
import { Customer } from '../customers/schemas/customer.schema';
import { SCOPE_EXPR, scopeFilter } from '../expenses/expense-scope';
import { Expense } from '../expenses/schemas/expense.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { Project } from '../projects/schemas/project.schema';
import { Staff } from '../staff/schemas/staff.schema';
import type { ExpenseBreakdownQueryDto, ExpenseByCategoryQueryDto } from './dto/finance-query.dto';
import { computeFinance, FinanceBlock } from './finance.util';

export interface ProjectFinanceRow extends FinanceBlock {
  projectId: string;
  name: string;
  clientName: string | null;
  customerId: string | null;
  stage: ProjectStage;
}

export interface FinanceSummary {
  contractValue: number;
  received: number;
  pending: number;
  /** All business expenses: client projects + internal projects + company + owner. */
  expenses: number;
  /** Parts of `expenses` that belong to no client project. */
  internalExpenses: number;
  companyExpenses: number;
  ownerExpenses: number;
  /** received − expenses. */
  net: number;
  /** Client projects only: contract value − client-project expenses. */
  projected: number;
}

export interface MonthlyPoint {
  month: string;
  revenue: number;
  expense: number;
}

export interface CategoryTotal {
  category: ExpenseCategory;
  total: number;
  count: number;
}

export interface UserExpenseBreakdown {
  /** null groups expenses without a staff member (COMPANY / OWNER), named "Unassigned". */
  userId: string | null;
  name: string | null;
  role: string | null;
  type: string | null;
  total: number;
  categories: { category: ExpenseCategory; amount: number }[];
}

interface RawProjectFinance {
  _id: unknown;
  name: string;
  stage: ProjectStage;
  customerId: unknown;
  clientName?: string | null;
  contract: number;
  received: number;
  spent: number;
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectModel(Project.name) private readonly projectModel: SoftDeleteModel<Project>,
    @InjectModel(Payment.name) private readonly paymentModel: SoftDeleteModel<Payment>,
    @InjectModel(Expense.name) private readonly expenseModel: SoftDeleteModel<Expense>,
    @InjectModel(Customer.name) private readonly customerModel: SoftDeleteModel<Customer>,
    @InjectModel(Staff.name) private readonly staffModel: SoftDeleteModel<Staff>,
  ) {}

  /**
   * Per-project contract / received / spent via $lookup sub-pipelines that $group payments and
   * expenses (soft-deleted rows excluded inside the lookups, since plugin hooks only see the root).
   */
  private projectFinancePipeline(match: Record<string, unknown> = {}): PipelineStage[] {
    const sumLookup = (from: string, as: string): PipelineStage.Lookup => ({
      $lookup: {
        from,
        let: { pid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$projectId', '$$pid'] }, deletedAt: null } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
        as,
      },
    });
    return [
      { $match: match },
      sumLookup(this.paymentModel.collection.name, 'pay'),
      sumLookup(this.expenseModel.collection.name, 'exp'),
      {
        $lookup: {
          from: this.customerModel.collection.name,
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
        },
      },
      {
        $project: {
          name: 1,
          stage: 1,
          customerId: 1,
          clientName: { $first: '$customer.name' },
          contract: { $ifNull: ['$contractValue', 0] },
          received: { $ifNull: [{ $first: '$pay.total' }, 0] },
          spent: { $ifNull: [{ $first: '$exp.total' }, 0] },
        },
      },
      { $sort: { name: 1 } },
    ];
  }

  private toRow(r: RawProjectFinance): ProjectFinanceRow {
    return {
      projectId: idOf(r._id as string)!,
      name: r.name,
      clientName: r.clientName ?? null,
      customerId: idOf(r.customerId as string),
      stage: r.stage,
      ...computeFinance({ contract: r.contract, received: r.received, spent: r.spent }),
    };
  }

  async projectRows(match: FilterQuery<Project> = {}): Promise<ProjectFinanceRow[]> {
    const rows = await this.projectModel.aggregate<RawProjectFinance>(
      this.projectFinancePipeline(match as Record<string, unknown>),
    );
    return rows.map((r) => this.toRow(r));
  }

  async projectFinance(projectId: string): Promise<FinanceBlock> {
    const [row] = await this.projectRows({ _id: toObjectId(projectId) });
    return row
      ? computeFinance({ contract: row.contract, received: row.received, spent: row.spent })
      : computeFinance({ contract: 0, received: 0, spent: 0 });
  }

  async summary(): Promise<FinanceSummary> {
    const byScope = this.expenseModel.aggregate<{ _id: ExpenseScope; total: number }>([
      { $match: { $expr: { $ne: [SCOPE_EXPR, 'PROJECT'] } } },
      { $group: { _id: SCOPE_EXPR, total: { $sum: '$amount' } } },
    ]);
    const [row] = await this.projectModel.aggregate<{
      contract: number;
      received: number;
      pending: number;
      spent: number;
    }>([
      ...this.projectFinancePipeline(),
      {
        $group: {
          _id: null,
          contract: { $sum: '$contract' },
          received: { $sum: '$received' },
          spent: { $sum: '$spent' },
          pending: { $sum: { $max: [{ $subtract: ['$contract', '$received'] }, 0] } },
        },
      },
    ]);
    const contract = round2(row?.contract ?? 0);
    const received = round2(row?.received ?? 0);
    const spent = round2(row?.spent ?? 0);
    const other = new Map((await byScope).map((r) => [r._id, round2(r.total)]));
    const internalExpenses = other.get('INTERNAL_PROJECT') ?? 0;
    const companyExpenses = other.get('COMPANY') ?? 0;
    const ownerExpenses = other.get('OWNER') ?? 0;
    // Client-project spend comes from the per-project pipeline (same basis as `projected`).
    const expenses = round2(spent + internalExpenses + companyExpenses + ownerExpenses);
    return {
      contractValue: contract,
      received,
      pending: round2(row?.pending ?? 0),
      expenses,
      internalExpenses,
      companyExpenses,
      ownerExpenses,
      net: round2(received - expenses),
      projected: round2(contract - spent),
    };
  }

  /** Total payments received / contract value booked / expenses (every scope). */
  async totals(): Promise<{ revenue: number; booked: number; expenses: number }> {
    const sumOf = (field: string): PipelineStage[] => [
      { $group: { _id: null, total: { $sum: `$${field}` } } },
    ];
    type Total = { total: number };
    const [[revenue], [booked], [expenses]] = await Promise.all([
      this.paymentModel.aggregate<Total>(sumOf('amount')),
      this.projectModel.aggregate<Total>(sumOf('contractValue')),
      this.expenseModel.aggregate<Total>(sumOf('amount')),
    ]);
    return {
      revenue: round2(revenue?.total ?? 0),
      booked: round2(booked?.total ?? 0),
      expenses: round2(expenses?.total ?? 0),
    };
  }

  /** Last `months` calendar months (UTC), oldest first, including the current month. */
  async monthly(months = 6, now = new Date()): Promise<MonthlyPoint[]> {
    const start = startOfUtcMonth(now, -(months - 1));
    const byMonth = (dateField: string): PipelineStage[] => [
      { $match: { [dateField]: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: `$${dateField}`, timezone: 'UTC' } },
          total: { $sum: '$amount' },
        },
      },
    ];
    const [revenue, expense] = await Promise.all([
      this.paymentModel.aggregate<{ _id: string; total: number }>(byMonth('paidOn')),
      this.expenseModel.aggregate<{ _id: string; total: number }>(byMonth('spentOn')),
    ]);
    const rev = new Map(revenue.map((r) => [r._id, r.total]));
    const exp = new Map(expense.map((r) => [r._id, r.total]));
    return Array.from({ length: months }, (_, i) => {
      const month = monthKey(startOfUtcMonth(start, i));
      return { month, revenue: round2(rev.get(month) ?? 0), expense: round2(exp.get(month) ?? 0) };
    });
  }

  private expenseMatch(q: ExpenseBreakdownQueryDto & { category?: ExpenseCategory }) {
    const match: Record<string, unknown> = q.scope ? scopeFilter(q.scope) : {};
    if (q.projectId) match.projectId = toObjectId(q.projectId);
    if (q.category) match.category = q.category;
    const range = dateRange(q.from, q.to);
    if (range) match.spentOn = range;
    return match;
  }

  async expensesByCategory(q: ExpenseByCategoryQueryDto): Promise<CategoryTotal[]> {
    const rows = await this.expenseModel.aggregate<{
      _id: ExpenseCategory;
      total: number;
      count: number;
    }>([
      { $match: this.expenseMatch(q) },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1, _id: 1 } },
    ]);
    return rows.map((r) => ({ category: r._id, total: round2(r.total), count: r.count }));
  }

  async expensesByUser(q: ExpenseBreakdownQueryDto): Promise<UserExpenseBreakdown[]> {
    const rows = await this.expenseModel.aggregate<{
      _id: unknown;
      total: number;
      categories: { category: ExpenseCategory; amount: number }[];
      staff?: { name: string; role: string; type: string };
    }>([
      { $match: this.expenseMatch(q) },
      {
        $group: {
          _id: { staffId: '$staffId', category: '$category' },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { amount: -1 } },
      {
        $group: {
          _id: '$_id.staffId',
          total: { $sum: '$amount' },
          categories: { $push: { category: '$_id.category', amount: '$amount' } },
        },
      },
      {
        $lookup: {
          from: this.staffModel.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'staff',
        },
      },
      { $set: { staff: { $first: '$staff' } } },
      { $sort: { total: -1, 'staff.name': 1 } },
    ]);
    return rows.map((r) => ({
      userId: idOf(r._id as string),
      name: r._id ? (r.staff?.name ?? null) : 'Unassigned',
      role: r.staff?.role ?? null,
      type: r.staff?.type ?? null,
      total: round2(r.total),
      categories: r.categories.map((c) => ({ category: c.category, amount: round2(c.amount) })),
    }));
  }
}
