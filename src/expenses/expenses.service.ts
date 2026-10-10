import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, FilterQuery } from 'mongoose';
import { paginated, PaginatedResult, skipFor } from '../common/dto/pagination.dto';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { parseDateOnly } from '../common/utils/date.util';
import { dateRange } from '../common/utils/date-range.util';
import { idOf } from '../common/utils/object-id.util';
import { containsAny } from '../common/utils/regex.util';
import { InternalProject } from '../internal-projects/schemas/internal-project.schema';
import { Project } from '../projects/schemas/project.schema';
import { Staff } from '../staff/schemas/staff.schema';
import { StaffService } from '../staff/staff.service';
import { CreateExpenseBatchDto, ListExpensesQueryDto, UpdateExpenseDto } from './dto/expense.dto';
import { expenseScopeError, inferExpenseScope, scopeFilter } from './expense-scope';
import { ExpenseResponse, toExpenseResponse } from './expense.mapper';
import { Expense } from './schemas/expense.schema';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Expense.name) private readonly expenseModel: SoftDeleteModel<Expense>,
    @InjectModel(Project.name) private readonly projectModel: SoftDeleteModel<Project>,
    @InjectModel(InternalProject.name)
    private readonly internalProjectModel: SoftDeleteModel<InternalProject>,
    @InjectModel(Staff.name) private readonly staffModel: SoftDeleteModel<Staff>,
    private readonly staff: StaffService,
  ) {}

  async list(query: ListExpensesQueryDto): Promise<PaginatedResult<ExpenseResponse>> {
    const filter: FilterQuery<Expense> = { ...(containsAny(['note'], query.search) ?? {}) };
    if (query.projectId) filter.projectId = query.projectId;
    if (query.internalProjectId) filter.internalProjectId = query.internalProjectId;
    if (query.scope) Object.assign(filter, scopeFilter(query.scope));
    if (query.category) filter.category = query.category;
    if (query.staffId) filter.staffId = query.staffId;
    const range = dateRange(query.from, query.to);
    if (range) filter.spentOn = range;
    const [rows, total] = await Promise.all([
      this.expenseModel
        .find(filter)
        .sort({ spentOn: -1, createdAt: -1 })
        .skip(skipFor(query))
        .limit(query.limit)
        .lean(),
      this.expenseModel.countDocuments(filter),
    ]);
    const names = await this.names(rows);
    return paginated(
      rows.map((r) => toExpenseResponse(r, names)),
      total,
      query,
    );
  }

  /** Full list for a project's detail page. */
  async listForProject(projectId: string): Promise<ExpenseResponse[]> {
    if (!(await this.projectModel.exists({ _id: projectId }))) {
      throw new NotFoundException('Project not found');
    }
    const rows = await this.expenseModel
      .find({ projectId })
      .sort({ spentOn: -1, createdAt: -1 })
      .lean();
    const names = await this.names(rows);
    return rows.map((r) => toExpenseResponse(r, { staff: names.staff }));
  }

  /** Full list for an internal project's detail page. */
  async listForInternalProject(internalProjectId: string): Promise<ExpenseResponse[]> {
    if (!(await this.internalProjectModel.exists({ _id: internalProjectId }))) {
      throw new NotFoundException('Internal project not found');
    }
    const rows = await this.expenseModel
      .find({ internalProjectId })
      .sort({ spentOn: -1, createdAt: -1 })
      .lean();
    const names = await this.names(rows);
    return rows.map((r) => toExpenseResponse(r, { staff: names.staff }));
  }

  /** Each category line becomes its own Expense document; all-or-nothing via a transaction. */
  async createBatch(dto: CreateExpenseBatchDto): Promise<ExpenseResponse[]> {
    const scope = dto.scope ?? inferExpenseScope(dto);
    if (!scope) {
      throw new BadRequestException(
        'scope is required (PROJECT, INTERNAL_PROJECT, COMPANY or OWNER)',
      );
    }
    const invalid = expenseScopeError(scope, dto);
    if (invalid) throw new BadRequestException(invalid);
    if (scope === 'PROJECT' && !(await this.projectModel.exists({ _id: dto.projectId }))) {
      throw new BadRequestException('Project not found');
    }
    if (
      scope === 'INTERNAL_PROJECT' &&
      !(await this.internalProjectModel.exists({ _id: dto.internalProjectId }))
    ) {
      throw new BadRequestException('Internal project not found');
    }
    if (dto.staffId) await this.staff.assertExist([dto.staffId], undefined, 'staffId');
    const spentOn = parseDateOnly(dto.spentOn);

    const session = await this.connection.startSession();
    let created: Expense[] = [];
    try {
      await session.withTransaction(async () => {
        const docs = await this.expenseModel.insertMany(
          dto.lines.map((line) => ({
            scope,
            projectId: dto.projectId ?? null,
            internalProjectId: dto.internalProjectId ?? null,
            staffId: dto.staffId ?? null,
            category: line.category,
            amount: line.amount,
            spentOn,
            note: line.note ?? null,
          })),
          { session },
        );
        created = docs.map((d) => d.toObject() as Expense);
      });
    } finally {
      await session.endSession();
    }
    this.logger.log(
      `Expense batch: ${created.length} ${scope} line(s)` +
        ((dto.projectId ?? dto.internalProjectId)
          ? ` on ${dto.projectId ?? dto.internalProjectId}`
          : ''),
    );
    return created.map((e) => toExpenseResponse(e));
  }

  async update(id: string, dto: UpdateExpenseDto): Promise<ExpenseResponse> {
    if (dto.staffId) await this.staff.assertExist([dto.staffId], undefined, 'staffId');
    if (dto.staffId === null) {
      const current = await this.expenseModel.findById(id).lean();
      if (!current) throw new NotFoundException('Expense not found');
      const scope = current.scope ?? inferExpenseScope(current) ?? 'PROJECT';
      const error = expenseScopeError(scope, { ...current, staffId: null });
      if (error) throw new BadRequestException(error);
    }
    const set: Record<string, unknown> = {};
    if (dto.category !== undefined) set.category = dto.category;
    if (dto.amount !== undefined) set.amount = dto.amount;
    if (dto.spentOn !== undefined) set.spentOn = parseDateOnly(dto.spentOn);
    if (dto.staffId !== undefined) set.staffId = dto.staffId;
    if (dto.note !== undefined) set.note = dto.note;
    const updated = await this.expenseModel
      .findOneAndUpdate({ _id: id }, { $set: set }, { new: true, runValidators: true })
      .lean();
    if (!updated) throw new NotFoundException('Expense not found');
    return toExpenseResponse(updated);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const deleted = await this.expenseModel.softDelete(id);
    if (!deleted) throw new NotFoundException('Expense not found');
    return { id, deleted: true };
  }

  private async names(rows: Expense[]) {
    const ids = (pick: (r: Expense) => unknown) => [
      ...new Set(rows.map((r) => idOf(pick(r) as string)).filter((id): id is string => !!id)),
    ];
    const [projects, internalProjects, staff] = await Promise.all([
      this.projectModel
        .find({ _id: { $in: ids((r) => r.projectId) } })
        .select('name')
        .setOptions({ withDeleted: true })
        .lean(),
      this.internalProjectModel
        .find({ _id: { $in: ids((r) => r.internalProjectId) } })
        .select('name')
        .setOptions({ withDeleted: true })
        .lean(),
      this.staffModel
        .find({ _id: { $in: ids((r) => r.staffId) } })
        .select('name')
        .setOptions({ withDeleted: true })
        .lean(),
    ]);
    return {
      projects: new Map(projects.map((p) => [p._id.toHexString(), p.name])),
      internalProjects: new Map(internalProjects.map((p) => [p._id.toHexString(), p.name])),
      staff: new Map(staff.map((s) => [s._id.toHexString(), s.name])),
    };
  }
}
