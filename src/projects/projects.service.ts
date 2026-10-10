import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, UpdateQuery } from 'mongoose';
import type { ProjectStage } from '../common/constants/enums';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { parseDateOnly } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import { escapeRegex } from '../common/utils/regex.util';
import { Customer } from '../customers/schemas/customer.schema';
import { FinanceService } from '../finance/finance.service';
import type { FinanceBlock } from '../finance/finance.util';
import { Lead } from '../leads/schemas/lead.schema';
import type { Staff } from '../staff/schemas/staff.schema';
import { StaffService } from '../staff/staff.service';
import { UsersService } from '../users/users.service';
import { ListProjectsQueryDto, UpdateProgressDto, UpdateProjectDto } from './dto/project.dto';
import {
  ProjectResponse,
  StageHistoryResponse,
  toProjectResponse,
  toStageHistory,
} from './project.mapper';
import { Project, ProjectDocument } from './schemas/project.schema';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  type: Staff['type'];
  email: string | null;
  phone: string | null;
  isActive: boolean;
}

export interface ProjectDetailResponse extends Omit<ProjectResponse, 'team'> {
  team: TeamMember[];
  teamIds: string[];
  engineerCount: number;
  staffCount: number;
  finance: FinanceBlock;
  stageHistory: StageHistoryResponse[];
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectModel(Project.name) private readonly projectModel: SoftDeleteModel<Project>,
    @InjectModel(Customer.name) private readonly customerModel: SoftDeleteModel<Customer>,
    @InjectModel(Lead.name) private readonly leadModel: SoftDeleteModel<Lead>,
    private readonly staff: StaffService,
    private readonly users: UsersService,
    private readonly finance: FinanceService,
  ) {}

  /** Full list for the project board (no pagination). */
  async list(query: ListProjectsQueryDto): Promise<ProjectResponse[]> {
    const filter: FilterQuery<Project> = {};
    if (query.status === 'closed') {
      if (query.stage && query.stage !== 'CLOSED') return [];
      filter.stage = 'CLOSED';
    } else if (query.status === 'running') {
      if (query.stage === 'CLOSED') return [];
      filter.stage = query.stage ?? { $ne: 'CLOSED' };
    } else if (query.stage) {
      filter.stage = query.stage;
    }
    if (query.customerId) filter.customerId = query.customerId;
    if (query.search?.trim()) filter.name = new RegExp(escapeRegex(query.search.trim()), 'i');

    const projects = await this.projectModel
      .find(filter)
      .select('-stageHistory')
      .sort({ createdAt: -1 })
      .lean();
    const names = await this.customerNames(projects.map((p) => idOf(p.customerId)));
    return projects.map((p) => toProjectResponse(p, names.get(idOf(p.customerId)!) ?? null));
  }

  async findOrFail(id: string): Promise<ProjectDocument> {
    const project = await this.projectModel.findById(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async detail(id: string): Promise<ProjectDetailResponse> {
    const project = await this.projectModel.findById(id).lean();
    if (!project) throw new NotFoundException('Project not found');

    const [customerNames, team, finance, userNames] = await Promise.all([
      this.customerNames([idOf(project.customerId)]),
      this.teamMembers(project.team.map((t) => idOf(t)!)),
      this.finance.projectFinance(id),
      this.users.namesByIds(project.stageHistory.map((h) => idOf(h.by))),
    ]);
    const base = toProjectResponse(project, customerNames.get(idOf(project.customerId)!) ?? null);
    return {
      ...base,
      team,
      teamIds: base.team,
      engineerCount: team.filter((m) => m.type === 'ENGINEER').length,
      staffCount: team.filter((m) => m.type === 'STAFF').length,
      finance,
      stageHistory: toStageHistory(project.stageHistory, userNames),
    };
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectDetailResponse> {
    const project = await this.findOrFail(id);
    const startDate = dto.startDate ? parseDateOnly(dto.startDate) : project.startDate;
    const endDate = dto.endDate ? parseDateOnly(dto.endDate) : project.endDate;
    if (endDate < startDate) throw new BadRequestException('endDate must be on or after startDate');

    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    if (dto.requirements !== undefined) project.requirements = dto.requirements;
    project.startDate = startDate;
    project.endDate = endDate;
    if (dto.contractValue !== undefined) project.contractValue = dto.contractValue;
    if (dto.plan !== undefined) project.plan = dto.plan;
    await project.save();

    if (dto.contractValue !== undefined) {
      // The won lead's value mirrors the contract.
      await this.leadModel.updateOne(
        { _id: project.leadId },
        { $set: { value: dto.contractValue } },
      );
    }
    return this.detail(id);
  }

  /**
   * Any stage is allowed except CLOSED, which requires `clientApproved`. Entering
   * CLIENT_CONFIRMATION starts a new approval round; leaving CLOSED clears `closedAt`.
   */
  async changeStage(
    id: string,
    stage: ProjectStage,
    actor: AuthUser,
  ): Promise<ProjectDetailResponse> {
    const project = await this.findOrFail(id);
    if (project.stage === stage) return this.detail(id);
    if (stage === 'CLOSED' && !project.clientApproved) {
      throw new ConflictException(
        'A project can be closed only after the client has approved it (CLIENT_CONFIRMATION)',
      );
    }
    const now = new Date();
    const set: Record<string, unknown> = { stage };
    if (stage === 'CLOSED') set.closedAt = now;
    if (project.stage === 'CLOSED') set.closedAt = null;
    if (stage === 'CLIENT_CONFIRMATION') set.clientApproved = false;

    const updated = await this.projectModel.findOneAndUpdate(
      { _id: id, stage: project.stage },
      {
        $set: set,
        $push: { stageHistory: { from: project.stage, to: stage, by: actor.id, at: now } },
      },
      { new: true },
    );
    if (!updated)
      throw new ConflictException('Project was modified concurrently; reload and retry');
    this.logger.log(`Project ${id}: ${project.stage} → ${stage} by ${actor.email}`);
    return this.detail(id);
  }

  async updateProgress(id: string, dto: UpdateProgressDto): Promise<ProjectDetailResponse> {
    const set: Record<string, number> = {};
    for (const track of ['requirement', 'ui', 'frontend', 'backend'] as const) {
      if (dto[track] !== undefined) set[`dev.${track}`] = dto[track]!;
    }
    if (Object.keys(set).length === 0) {
      throw new BadRequestException('Provide at least one of requirement, ui, frontend, backend');
    }
    const updated = await this.projectModel.findOneAndUpdate(
      { _id: id },
      { $set: set },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Project not found');
    return this.detail(id);
  }

  async setTeam(id: string, staffIds: string[]): Promise<ProjectDetailResponse> {
    await this.staff.assertExist(staffIds);
    const updated = await this.projectModel.findOneAndUpdate(
      { _id: id },
      { $set: { team: staffIds } },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Project not found');
    return this.detail(id);
  }

  /**
   * Client approval: only from CLIENT_CONFIRMATION → CLOSED. When `customerId` is given (portal),
   * the project must belong to that customer; otherwise 404 so existence is not leaked.
   */
  async approve(id: string, actor: AuthUser, customerId?: string): Promise<ProjectDocument> {
    const now = new Date();
    return this.clientDecision(id, customerId, {
      $set: { clientApproved: true, stage: 'CLOSED', closedAt: now },
      $push: { stageHistory: { from: 'CLIENT_CONFIRMATION', to: 'CLOSED', by: actor.id, at: now } },
    }).then((p) => {
      this.logger.log(`Project ${id} approved by ${actor.email} (${actor.role}) and closed`);
      return p;
    });
  }

  async requestChanges(
    id: string,
    note: string,
    actor: AuthUser,
    customerId?: string,
  ): Promise<ProjectDocument> {
    const now = new Date();
    const p = await this.clientDecision(id, customerId, {
      $set: { clientApproved: false, clientNote: note, stage: 'CONFIRMATION_TESTING' },
      $push: {
        stageHistory: {
          from: 'CLIENT_CONFIRMATION',
          to: 'CONFIRMATION_TESTING',
          by: actor.id,
          at: now,
        },
      },
    });
    this.logger.log(`Project ${id}: client ${actor.email} requested changes`);
    return p;
  }

  private async clientDecision(
    id: string,
    customerId: string | undefined,
    update: UpdateQuery<Project>,
  ): Promise<ProjectDocument> {
    const scope: FilterQuery<Project> = { _id: id };
    if (customerId !== undefined) scope.customerId = customerId;
    // Atomic: the stage condition prevents double approval / racing requests.
    const updated = await this.projectModel.findOneAndUpdate(
      { ...scope, stage: 'CLIENT_CONFIRMATION' },
      update,
      { new: true },
    );
    if (updated) return updated;
    const exists = await this.projectModel.exists(scope);
    if (!exists) throw new NotFoundException('Project not found');
    throw new ConflictException('Project is not awaiting client confirmation');
  }

  async customerNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return new Map();
    const customers = await this.customerModel
      .find({ _id: { $in: unique } })
      .select('name')
      .setOptions({ withDeleted: true })
      .lean();
    return new Map(customers.map((c) => [c._id.toHexString(), c.name]));
  }

  async teamMembers(ids: string[]): Promise<TeamMember[]> {
    if (!ids.length) return [];
    const members = await this.staff.findByIds(ids, { withDeleted: true });
    const byId = new Map(members.map((m) => [m._id.toHexString(), m]));
    return ids
      .map((id) => byId.get(id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({
        id: m._id.toHexString(),
        name: m.name,
        role: m.role,
        type: m.type,
        email: m.email ?? null,
        phone: m.phone ?? null,
        isActive: m.isActive && !m.deletedAt,
      }));
  }
}
