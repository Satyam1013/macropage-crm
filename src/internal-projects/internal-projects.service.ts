import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, FilterQuery, Types } from 'mongoose';
import { paginated, PaginatedResult, skipFor } from '../common/dto/pagination.dto';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { parseDateOnly } from '../common/utils/date.util';
import { round2 } from '../common/utils/money.util';
import { idOf } from '../common/utils/object-id.util';
import { containsAny } from '../common/utils/regex.util';
import { Expense } from '../expenses/schemas/expense.schema';
import {
  CreateInternalProjectDto,
  ListInternalProjectsQueryDto,
  UpdateInternalProjectDto,
} from './dto/internal-project.dto';
import { InternalProjectResponse, toInternalProjectResponse } from './internal-project.mapper';
import { InternalProject } from './schemas/internal-project.schema';

const toDate = (v: string | null | undefined) => (v ? parseDateOnly(v) : null);

@Injectable()
export class InternalProjectsService {
  private readonly logger = new Logger(InternalProjectsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(InternalProject.name)
    private readonly internalProjectModel: SoftDeleteModel<InternalProject>,
    @InjectModel(Expense.name) private readonly expenseModel: SoftDeleteModel<Expense>,
  ) {}

  async list(
    query: ListInternalProjectsQueryDto,
  ): Promise<PaginatedResult<InternalProjectResponse>> {
    const filter: FilterQuery<InternalProject> = {
      ...(containsAny(['name', 'description'], query.search) ?? {}),
    };
    if (query.status) filter.status = query.status;
    const [rows, total] = await Promise.all([
      this.internalProjectModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skipFor(query))
        .limit(query.limit)
        .lean(),
      this.internalProjectModel.countDocuments(filter),
    ]);
    const spent = await this.spentByProject(rows.map((r) => r._id));
    return paginated(
      rows.map((r) => toInternalProjectResponse(r, spent.get(idOf(r._id)!) ?? 0)),
      total,
      query,
    );
  }

  async get(id: string): Promise<InternalProjectResponse> {
    const project = await this.internalProjectModel.findById(id).lean();
    if (!project) throw new NotFoundException('Internal project not found');
    const spent = await this.spentByProject([project._id]);
    return toInternalProjectResponse(project, spent.get(id) ?? 0);
  }

  async create(dto: CreateInternalProjectDto): Promise<InternalProjectResponse> {
    const startDate = toDate(dto.startDate);
    const endDate = toDate(dto.endDate);
    this.assertDates(startDate, endDate);
    const created = await this.internalProjectModel.create({
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status ?? 'ACTIVE',
      budget: dto.budget ?? null,
      startDate,
      endDate,
    });
    return toInternalProjectResponse(created.toObject(), 0);
  }

  async update(id: string, dto: UpdateInternalProjectDto): Promise<InternalProjectResponse> {
    // PartialType skips validation for null: only the nullable fields may be cleared.
    if (dto.name === null) throw new BadRequestException('name should not be empty');
    if (dto.status === null) throw new BadRequestException('status must not be null');
    const project = await this.internalProjectModel.findById(id);
    if (!project) throw new NotFoundException('Internal project not found');
    const startDate = dto.startDate === undefined ? project.startDate : toDate(dto.startDate);
    const endDate = dto.endDate === undefined ? project.endDate : toDate(dto.endDate);
    this.assertDates(startDate ?? null, endDate ?? null);

    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    if (dto.status !== undefined) project.status = dto.status;
    if (dto.budget !== undefined) project.budget = dto.budget;
    project.startDate = startDate ?? null;
    project.endDate = endDate ?? null;
    await project.save();
    return this.get(id);
  }

  /** Soft-deletes the project and all its expenses together (they leave Finance totals). */
  async remove(id: string): Promise<{ id: string; deleted: true; expensesDeleted: number }> {
    const session = await this.connection.startSession();
    let expensesDeleted = 0;
    try {
      await session.withTransaction(async () => {
        const deleted = await this.internalProjectModel.softDelete(id, session);
        if (!deleted) throw new NotFoundException('Internal project not found');
        const res = await this.expenseModel.updateMany(
          { internalProjectId: deleted._id },
          { $set: { deletedAt: new Date() } },
          { session },
        );
        expensesDeleted = res.modifiedCount;
      });
    } finally {
      await session.endSession();
    }
    this.logger.log(`Internal project ${id} deleted with ${expensesDeleted} expense(s)`);
    return { id, deleted: true, expensesDeleted };
  }

  private assertDates(startDate: Date | null, endDate: Date | null): void {
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
  }

  private async spentByProject(ids: Types.ObjectId[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.expenseModel.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { internalProjectId: { $in: ids } } },
      { $group: { _id: '$internalProjectId', total: { $sum: '$amount' } } },
    ]);
    return new Map(rows.map((r) => [idOf(r._id)!, round2(r.total)]));
  }
}
