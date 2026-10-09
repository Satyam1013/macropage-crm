import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, FilterQuery } from 'mongoose';
import { LeadStage, PIPELINE_LEAD_STAGES } from '../common/constants/enums';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { parseDateOnly } from '../common/utils/date.util';
import { round2 } from '../common/utils/money.util';
import { idOf } from '../common/utils/object-id.util';
import { generateTemporaryPassword } from '../common/utils/password.util';
import { containsAny, escapeRegex } from '../common/utils/regex.util';
import type { EnvironmentVariables } from '../config/env.validation';
import { Customer } from '../customers/schemas/customer.schema';
import { ProjectResponse, toProjectResponse } from '../projects/project.mapper';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { StaffService } from '../staff/staff.service';
import { UsersService } from '../users/users.service';
import { ConvertLeadDto, CreateLeadDto, ListLeadsQueryDto, UpdateLeadDto } from './dto/lead.dto';
import {
  LeadDetailResponse,
  LeadResponse,
  toLeadDetailResponse,
  toLeadResponse,
} from './lead.mapper';
import { Lead } from './schemas/lead.schema';

export interface LeadStats {
  total: number;
  inPipeline: number;
  pipelineValue: number;
  won: number;
  wonValue: number;
  cancelled: number;
  /** won / total × 100, rounded. */
  winRate: number;
}

export interface ConvertLeadResult extends ProjectResponse {
  /** Present when a CUSTOMER login was created during conversion. */
  invite?: { email: string; temporaryPassword?: string };
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Lead.name) private readonly leadModel: SoftDeleteModel<Lead>,
    @InjectModel(Project.name) private readonly projectModel: SoftDeleteModel<Project>,
    @InjectModel(Customer.name) private readonly customerModel: SoftDeleteModel<Customer>,
    private readonly staff: StaffService,
    private readonly users: UsersService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Full list for the Kanban board (no pagination). */
  async list(query: ListLeadsQueryDto): Promise<LeadResponse[]> {
    const filter: FilterQuery<Lead> = {
      ...(containsAny(['title', 'company', 'contactName'], query.search) ?? {}),
    };
    if (query.stage) filter.stage = query.stage;
    if (query.ownerId) filter.ownerId = query.ownerId;
    if (query.source?.trim())
      filter.source = new RegExp(`^${escapeRegex(query.source.trim())}$`, 'i');
    const leads = await this.leadModel
      .find(filter)
      .select('-stageHistory')
      .sort({ createdAt: -1 })
      .lean();
    return leads.map(toLeadResponse);
  }

  async get(id: string): Promise<LeadDetailResponse> {
    const lead = await this.leadModel.findById(id).lean();
    if (!lead) throw new NotFoundException('Lead not found');
    const names = await this.users.namesByIds(lead.stageHistory.map((h) => idOf(h.by)));
    return toLeadDetailResponse(lead, names);
  }

  async create(dto: CreateLeadDto, actor: AuthUser): Promise<LeadDetailResponse> {
    const stage = dto.stage ?? 'LEAD';
    if (stage === 'WON') {
      throw new BadRequestException('A lead cannot be created as WON; use POST /leads/:id/convert');
    }
    await this.staff.assertExist([dto.ownerId], undefined, 'ownerId');
    const now = new Date();
    const lead = await this.leadModel.create({
      ...dto,
      stage,
      expectedClose: dto.expectedClose ? parseDateOnly(dto.expectedClose) : null,
      stageUpdatedAt: now,
      stageHistory: [{ from: null, to: stage, by: actor.id, at: now }],
    });
    return this.get(lead.id as string);
  }

  async update(id: string, dto: UpdateLeadDto): Promise<LeadDetailResponse> {
    const lead = await this.leadModel.findById(id);
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.projectId && dto.value !== undefined && round2(dto.value) !== lead.value) {
      throw new ConflictException(
        'Lead is converted; its value follows the project contract value',
      );
    }
    if (dto.ownerId) await this.staff.assertExist([dto.ownerId], undefined, 'ownerId');
    const { expectedClose, ...rest } = dto;
    // Aliased DTO fields are always present (possibly undefined); never let them unset data.
    lead.set(Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
    if (expectedClose !== undefined) {
      lead.expectedClose = expectedClose ? parseDateOnly(expectedClose) : null;
    }
    await lead.save();
    return this.get(id);
  }

  /**
   * Free movement between LEAD … PENDING and CANCELLED. WON is reachable only via convert(),
   * and converted leads are locked.
   */
  async changeStage(id: string, stage: LeadStage, actor: AuthUser): Promise<LeadDetailResponse> {
    if (stage === 'WON') {
      throw new BadRequestException(
        'Leads cannot be moved to WON directly; use POST /leads/:id/convert',
      );
    }
    const lead = await this.leadModel.findById(id).select('stage projectId').lean();
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.projectId || lead.stage === 'WON') {
      throw new ConflictException('Lead has been converted to a project and is locked');
    }
    if (lead.stage === stage) return this.get(id);

    const now = new Date();
    // Conditional update guards against a concurrent conversion or stage change.
    const updated = await this.leadModel.findOneAndUpdate(
      { _id: id, stage: lead.stage, projectId: { $exists: false } },
      {
        $set: { stage, stageUpdatedAt: now },
        $push: { stageHistory: { from: lead.stage, to: stage, by: actor.id, at: now } },
      },
      { new: true },
    );
    if (!updated) throw new ConflictException('Lead was modified concurrently; reload and retry');
    return this.get(id);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const lead = await this.leadModel.findById(id).select('projectId').lean();
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.projectId) {
      throw new ConflictException('Converted leads cannot be deleted');
    }
    const deleted = await this.leadModel.findOneAndUpdate(
      { _id: id, projectId: { $exists: false } },
      { $set: { deletedAt: new Date() } },
    );
    if (!deleted) throw new ConflictException('Converted leads cannot be deleted');
    return { id, deleted: true };
  }

  async stats(): Promise<LeadStats> {
    const [row] = await this.leadModel.aggregate<{
      total: number;
      inPipeline: number;
      pipelineValue: number;
      won: number;
      wonValue: number;
      cancelled: number;
    }>([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          inPipeline: { $sum: { $cond: [{ $in: ['$stage', PIPELINE_LEAD_STAGES] }, 1, 0] } },
          pipelineValue: {
            $sum: { $cond: [{ $in: ['$stage', PIPELINE_LEAD_STAGES] }, '$value', 0] },
          },
          won: { $sum: { $cond: [{ $eq: ['$stage', 'WON'] }, 1, 0] } },
          wonValue: { $sum: { $cond: [{ $eq: ['$stage', 'WON'] }, '$value', 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$stage', 'CANCELLED'] }, 1, 0] } },
        },
      },
    ]);
    const s = row ?? {
      total: 0,
      inPipeline: 0,
      pipelineValue: 0,
      won: 0,
      wonValue: 0,
      cancelled: 0,
    };
    return {
      total: s.total,
      inPipeline: s.inPipeline,
      pipelineValue: round2(s.pipelineValue),
      won: s.won,
      wonValue: round2(s.wonValue),
      cancelled: s.cancelled,
      winRate: s.total ? Math.round((s.won / s.total) * 100) : 0,
    };
  }

  /**
   * Deal Won → Project, atomically (one multi-document transaction):
   * optional Customer (+ CUSTOMER login) → Project at INITIATE → lead marked WON and locked.
   */
  async convert(id: string, dto: ConvertLeadDto, actor: AuthUser): Promise<ConvertLeadResult> {
    const startDate = parseDateOnly(dto.startDate);
    const endDate = parseDateOnly(dto.endDate);
    if (!(dto.contractValue > 0)) throw new BadRequestException('contractValue must be > 0');
    if (endDate < startDate) throw new BadRequestException('endDate must be on or after startDate');

    const isProduction = this.config.get('NODE_ENV', { infer: true }) === 'production';
    const session = await this.connection.startSession();
    let project!: ProjectDocument;
    let clientName = '';
    let invite: { email: string; password: string; customerName: string } | null = null;

    try {
      await session.withTransaction(async () => {
        // Reset per attempt: withTransaction retries the callback on transient errors.
        invite = null;
        const lead = await this.leadModel.findById(id).session(session);
        if (!lead) throw new NotFoundException('Lead not found');
        if (lead.projectId || lead.stage === 'WON') {
          throw new ConflictException('Lead has already been converted');
        }
        if (lead.stage === 'CANCELLED') {
          throw new ConflictException('Cancelled leads cannot be converted; reopen it first');
        }
        await this.staff.assertExist(dto.staffIds ?? [], session);

        let customerId: string;
        if (dto.customerId === 'NEW') {
          const [customer] = await this.customerModel.create(
            [
              {
                name: lead.company,
                contactName: lead.contactName,
                email: lead.email,
                phone: lead.phone,
              },
            ],
            { session },
          );
          customerId = customer.id as string;
          clientName = customer.name;
          if (lead.email && !(await this.users.emailExists(lead.email, session))) {
            const password = generateTemporaryPassword();
            await this.users.createCustomerLogin(
              { name: lead.contactName || lead.company, email: lead.email, customerId },
              password,
              session,
            );
            invite = { email: lead.email, password, customerName: customer.name };
          }
        } else {
          const customer = await this.customerModel
            .findById(dto.customerId)
            .session(session)
            .lean();
          if (!customer) throw new BadRequestException('customerId does not reference a customer');
          customerId = dto.customerId;
          clientName = customer.name;
        }

        const now = new Date();
        [project] = await this.projectModel.create(
          [
            {
              leadId: lead._id,
              customerId,
              name: dto.name ?? lead.title,
              description: dto.description ?? lead.notes ?? '',
              requirements: dto.requirements ?? '',
              stage: 'INITIATE',
              startDate,
              endDate,
              contractValue: dto.contractValue,
              dev: { requirement: 0, ui: 0, frontend: 0, backend: 0 },
              team: dto.staffIds ?? [],
              clientApproved: false,
              stageHistory: [{ from: null, to: 'INITIATE', by: actor.id, at: now }],
            },
          ],
          { session },
        );

        const previousStage = lead.stage;
        lead.set({
          stage: 'WON',
          wonAt: now,
          stageUpdatedAt: now,
          projectId: project._id,
          customerId,
          value: dto.contractValue,
        });
        lead.stageHistory.push({ from: previousStage, to: 'WON', by: actor.id as never, at: now });
        await lead.save({ session });
      });
    } finally {
      await session.endSession();
    }

    // Side effects only after a successful commit.
    this.logger.log(
      `Lead ${id} converted to project ${project.id} by ${actor.email} (contract ${dto.contractValue})`,
    );
    const result: ConvertLeadResult = toProjectResponse(project.toObject(), clientName);
    const sent = invite as { email: string; password: string; customerName: string } | null;
    if (sent) {
      this.users.sendInvite(sent.email, sent.customerName);
      result.invite = {
        email: sent.email,
        ...(isProduction ? {} : { temporaryPassword: sent.password }),
      };
    }
    return result;
  }
}
