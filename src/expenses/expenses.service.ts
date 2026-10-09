import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, FilterQuery } from 'mongoose';
import { paginated, PaginatedResult, skipFor } from '../common/dto/pagination.dto';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { parseDateOnly } from '../common/utils/date.util';
import { dateRange } from '../common/utils/date-range.util';
import { idOf } from '../common/utils/object-id.util';
import { containsAny } from '../common/utils/regex.util';
import { Project } from '../projects/schemas/project.schema';
import { Staff } from '../staff/schemas/staff.schema';
import { StaffService } from '../staff/staff.service';
import { CreateExpenseBatchDto, ListExpensesQueryDto, UpdateExpenseDto } from './dto/expense.dto';
import { ExpenseResponse, toExpenseResponse } from './expense.mapper';
import { Expense } from './schemas/expense.schema';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Expense.name) private readonly expenseModel: SoftDeleteModel<Expense>,
    @InjectModel(Project.name) private readonly projectModel: SoftDeleteModel<Project>,
    @InjectModel(Staff.name) private readonly staffModel: SoftDeleteModel<Staff>,
    private readonly staff: StaffService,
  ) {}

  async list(query: ListExpensesQueryDto): Promise<PaginatedResult<ExpenseResponse>> {
    const filter: FilterQuery<Expense> = { ...(containsAny(['note'], query.search) ?? {}) };
    if (query.projectId) filter.projectId = query.projectId;
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

  /** Each category line becomes its own Expense document; all-or-nothing via a transaction. */
  async createBatch(dto: CreateExpenseBatchDto): Promise<ExpenseResponse[]> {
    if (!(await this.projectModel.exists({ _id: dto.projectId }))) {
      throw new BadRequestException('Project not found');
    }
    await this.staff.assertExist([dto.staffId], undefined, 'staffId');
    const spentOn = parseDateOnly(dto.spentOn);

    const session = await this.connection.startSession();
    let created: Expense[] = [];
    try {
      await session.withTransaction(async () => {
        const docs = await this.expenseModel.insertMany(
          dto.lines.map((line) => ({
            projectId: dto.projectId,
            staffId: dto.staffId,
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
    this.logger.log(`Expense batch: ${created.length} line(s) on project ${dto.projectId}`);
    return created.map((e) => toExpenseResponse(e));
  }

  async update(id: string, dto: UpdateExpenseDto): Promise<ExpenseResponse> {
    if (dto.staffId) await this.staff.assertExist([dto.staffId], undefined, 'staffId');
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
    const projectIds = [...new Set(rows.map((r) => idOf(r.projectId)!))];
    const staffIds = [...new Set(rows.map((r) => idOf(r.staffId)!))];
    const [projects, staff] = await Promise.all([
      this.projectModel
        .find({ _id: { $in: projectIds } })
        .select('name')
        .setOptions({ withDeleted: true })
        .lean(),
      this.staffModel
        .find({ _id: { $in: staffIds } })
        .select('name')
        .setOptions({ withDeleted: true })
        .lean(),
    ]);
    return {
      projects: new Map(projects.map((p) => [p._id.toHexString(), p.name])),
      staff: new Map(staff.map((s) => [s._id.toHexString(), s.name])),
    };
  }
}
