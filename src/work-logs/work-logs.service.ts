import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, FilterQuery } from 'mongoose';
import { WORK_TYPES, WorkLogScope } from '../common/constants/enums';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { idOf, toObjectId } from '../common/utils/object-id.util';
import { Lead } from '../leads/schemas/lead.schema';
import { Project } from '../projects/schemas/project.schema';
import { Staff } from '../staff/schemas/staff.schema';
import { CreateWorkLogsDto, ListWorkLogsQueryDto, UpdateWorkLogDto } from './dto/work-log.dto';
import { WorkLog } from './schemas/work-log.schema';
import {
  CurrentWorkResponse,
  toCurrentWork,
  toWorkLogResponse,
  WorkLogResponse,
} from './work-log.mapper';

const SORT = { updatedAt: -1, _id: -1 } as const;

@Injectable()
export class WorkLogsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(WorkLog.name) private readonly workLogModel: SoftDeleteModel<WorkLog>,
    @InjectModel(Project.name) private readonly projectModel: SoftDeleteModel<Project>,
    @InjectModel(Lead.name) private readonly leadModel: SoftDeleteModel<Lead>,
    @InjectModel(Staff.name) private readonly staffModel: SoftDeleteModel<Staff>,
  ) {}

  /** One row per (scope, type) item, all-or-nothing. */
  async createForProject(projectId: string, dto: CreateWorkLogsDto): Promise<WorkLogResponse[]> {
    const project = await this.projectModel.findById(projectId).select('team leadId').lean();
    if (!project) throw new NotFoundException('Project not found');

    if (!project.team.some((t) => idOf(t) === dto.staffId)) {
      throw new BadRequestException("staffId is not on this project's team");
    }
    if (!(await this.staffModel.exists({ _id: dto.staffId }))) {
      throw new BadRequestException('staffId does not reference a staff member');
    }
    const seen = new Set<string>();
    for (const item of dto.items) {
      this.assertType(item.scope, item.type);
      const key = `${item.scope}|${item.type}`;
      if (seen.has(key))
        throw new BadRequestException(`Duplicate item: ${item.scope} ${item.type}`);
      seen.add(key);
    }
    if (dto.items.some((i) => i.scope === 'LEAD') && !project.leadId) {
      throw new BadRequestException('This project has no lead to log LEAD work against');
    }

    const rows = dto.items.map((item) => ({
      scope: item.scope,
      projectId: item.scope === 'PROJECT' ? project._id : null,
      leadId: item.scope === 'LEAD' ? project.leadId : null,
      staffId: dto.staffId,
      type: item.type,
      note: dto.note ?? '',
      status: dto.status ?? 'IN_PROGRESS',
    }));
    const session = await this.connection.startSession();
    let ids: string[] = [];
    try {
      await session.withTransaction(async () => {
        const created = await this.workLogModel.insertMany(rows, { session });
        ids = created.map((c) => c.id as string);
      });
    } finally {
      await session.endSession();
    }
    const created = await this.workLogModel.find({ _id: { $in: ids } }).lean();
    // Keep request order.
    const byId = new Map(created.map((c) => [idOf(c._id)!, c]));
    return this.withNames(ids.map((id) => byId.get(id)!));
  }

  /** PROJECT logs for the project plus LEAD logs for the lead it was converted from. */
  async listForProject(projectId: string): Promise<WorkLogResponse[]> {
    const project = await this.projectModel.findById(projectId).select('leadId').lean();
    if (!project) throw new NotFoundException('Project not found');
    const or: FilterQuery<WorkLog>[] = [{ scope: 'PROJECT', projectId: project._id }];
    if (project.leadId) or.push({ scope: 'LEAD', leadId: project.leadId });
    const logs = await this.workLogModel.find({ $or: or }).sort(SORT).lean();
    return this.withNames(logs);
  }

  async list(query: ListWorkLogsQueryDto): Promise<WorkLogResponse[]> {
    const filter: FilterQuery<WorkLog> = {};
    if (query.staffId) filter.staffId = toObjectId(query.staffId);
    if (query.status) filter.status = query.status;
    if (query.projectId) filter.projectId = toObjectId(query.projectId);
    if (query.leadId) filter.leadId = toObjectId(query.leadId);
    const logs = await this.workLogModel.find(filter).sort(SORT).lean();
    return this.withNames(logs);
  }

  async update(id: string, dto: UpdateWorkLogDto): Promise<WorkLogResponse> {
    const log = await this.workLogModel.findById(id);
    if (!log) throw new NotFoundException('Work log not found');
    if (dto.type !== undefined) this.assertType(log.scope, dto.type);
    if (dto.type !== undefined) log.type = dto.type;
    if (dto.note !== undefined) log.note = dto.note;
    if (dto.status !== undefined) log.status = dto.status;
    await log.save();
    const [res] = await this.withNames([log.toObject()]);
    return res;
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const deleted = await this.workLogModel.softDelete(id);
    if (!deleted) throw new NotFoundException('Work log not found');
    return { id, deleted: true };
  }

  /** Non-DONE logs per staff member, newest first (for the staff / Hustlers list). */
  async currentWorkByStaff(staffIds: string[]): Promise<Map<string, CurrentWorkResponse[]>> {
    const result = new Map<string, CurrentWorkResponse[]>(staffIds.map((id) => [id, []]));
    if (staffIds.length === 0) return result;
    const logs = await this.workLogModel
      .find({ staffId: { $in: staffIds.map(toObjectId) }, status: { $ne: 'DONE' } })
      .sort(SORT)
      .lean();
    for (const log of await this.withNames(logs)) {
      result.get(log.staffId)?.push(toCurrentWork(log));
    }
    return result;
  }

  /** Cascade for a deleted staff member or lead. */
  async removeFor(
    ref: { staffId: string } | { leadId: string },
    session?: ClientSession,
  ): Promise<void> {
    const filter =
      'staffId' in ref ? { staffId: toObjectId(ref.staffId) } : { leadId: toObjectId(ref.leadId) };
    await this.workLogModel.updateMany(
      filter,
      { $set: { deletedAt: new Date() } },
      { session: session ?? undefined },
    );
  }

  private assertType(scope: WorkLogScope, type: string): void {
    if (!WORK_TYPES[scope].includes(type)) {
      throw new BadRequestException(`"${type}" is not a valid ${scope} work type`);
    }
  }

  /** Maps rows, resolving each target's name (deleted targets included, for history). */
  private async withNames(logs: WorkLog[]): Promise<WorkLogResponse[]> {
    const projectIds = [...new Set(logs.map((l) => idOf(l.projectId)).filter(Boolean))];
    const leadIds = [...new Set(logs.map((l) => idOf(l.leadId)).filter(Boolean))];
    const [projects, leads] = await Promise.all([
      projectIds.length
        ? this.projectModel
            .find({ _id: { $in: projectIds } })
            .setOptions({ withDeleted: true })
            .select('name')
            .lean()
        : [],
      leadIds.length
        ? this.leadModel
            .find({ _id: { $in: leadIds } })
            .setOptions({ withDeleted: true })
            .select('title')
            .lean()
        : [],
    ]);
    const names = new Map<string, string>([
      ...projects.map((p) => [idOf(p._id)!, p.name] as [string, string]),
      ...leads.map((l) => [idOf(l._id)!, l.title] as [string, string]),
    ]);
    return logs.map((l) => toWorkLogResponse(l, names.get(idOf(l.projectId ?? l.leadId)!) ?? null));
  }
}
