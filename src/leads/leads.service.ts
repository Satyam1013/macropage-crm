import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, FilterQuery, Types } from 'mongoose';
import { LeadStage, PIPELINE_LEAD_STAGES } from '../common/constants/enums';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { parseDateOnly } from '../common/utils/date.util';
import { round2 } from '../common/utils/money.util';
import { idOf } from '../common/utils/object-id.util';
import { generateTemporaryPassword } from '../common/utils/password.util';
import { normalizePhone } from '../common/utils/phone.util';
import { containsAny, escapeRegex } from '../common/utils/regex.util';
import type { EnvironmentVariables } from '../config/env.validation';
import { Customer } from '../customers/schemas/customer.schema';
import { ProjectResponse, toProjectResponse } from '../projects/project.mapper';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { StaffService } from '../staff/staff.service';
import { UsersService } from '../users/users.service';
import type { WhatsappStatus } from '../whatsapp/schemas/whatsapp-message.schema';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WorkLogsService } from '../work-logs/work-logs.service';
import {
  ConvertLeadDto,
  CreateLeadDto,
  LeadClientAccessDto,
  ListLeadsQueryDto,
  NewClientDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import {
  LeadDetailResponse,
  LeadResponse,
  toLeadDetailResponse,
  toLeadResponse,
} from './lead.mapper';
import { Lead } from './schemas/lead.schema';

type AccessState = Pick<Lead, 'visibleToClient' | 'showValueToClient'> & {
  customerId: string | null;
};

type AccessRequest = Pick<
  LeadClientAccessDto,
  'customerId' | 'newClient' | 'visibleToClient' | 'showValueToClient' | 'sendWhatsapp'
>;

interface LoginOutcome {
  created: boolean;
  email: string | null;
  temporaryPassword: string | null;
}

interface AccessOutcome {
  /** The request carried access fields (customerId / newClient / visibility flags). */
  changed: boolean;
  state: AccessState;
  /** The linked customer after the save. */
  customer: Customer | null;
  createdCustomer: boolean;
  login: LoginOutcome | null;
  sendWhatsapp: boolean;
}

/** Lead create/update response: the lead plus what happened to the client account. */
export type LeadSaveResponse = LeadDetailResponse & {
  /** A portal login was created; the password is shown outside production only. */
  invite?: { phone: string | null; email: string | null; temporaryPassword?: string };
  /** The queued WhatsApp message (null if it could not be queued). */
  whatsapp?: { id: string; status: WhatsappStatus } | null;
};

/** Separates the access fields (not stored on the lead as-is) from the lead's own fields. */
function splitAccess<T extends AccessRequest>(dto: T) {
  const { customerId, newClient, visibleToClient, showValueToClient, sendWhatsapp, ...rest } = dto;
  return {
    request: { customerId, newClient, visibleToClient, showValueToClient, sendWhatsapp },
    rest,
  };
}

const QUOTE_REQUIRED = 'Set the quote (PRO and PREMIUM prices) before moving to PROPOSAL';

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
  invite?: { phone: string | null; email: string | null; temporaryPassword?: string };
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
    private readonly workLogs: WorkLogsService,
    private readonly whatsapp: WhatsappService,
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

  async create(dto: CreateLeadDto, actor: AuthUser): Promise<LeadSaveResponse> {
    const stage = dto.stage ?? 'LEAD';
    if (stage === 'WON') {
      throw new BadRequestException('A lead cannot be created as WON; use POST /leads/:id/convert');
    }
    if (stage === 'PROPOSAL' && !dto.quote) {
      throw new BadRequestException(QUOTE_REQUIRED);
    }
    await this.staff.assertExist([dto.ownerId], undefined, 'ownerId');
    const { request, rest } = splitAccess(dto);
    const { expectedClose, ...fields } = rest;
    const id = new Types.ObjectId();
    const now = new Date();
    const outcome = await this.inTransaction(async (session) => {
      const access = await this.resolveClientAccess(null, request, dto.company, session);
      await this.leadModel.create(
        [
          {
            _id: id,
            ...fields,
            ...access.state,
            stage,
            expectedClose: expectedClose ? parseDateOnly(expectedClose) : null,
            stageUpdatedAt: now,
            stageHistory: [{ from: null, to: stage, by: actor.id, at: now }],
          },
        ],
        { session },
      );
      return access;
    });
    return this.afterSave(id.toHexString(), dto.title, outcome, actor);
  }

  /** Field edits and/or client access (see resolveClientAccess), in one transaction. */
  async update(id: string, dto: UpdateLeadDto, actor: AuthUser): Promise<LeadSaveResponse> {
    // PartialType makes every field skip validation when null; a quote cannot be cleared.
    if ((dto.quote as unknown) === null) {
      throw new BadRequestException('quote must have PRO and PREMIUM prices greater than 0');
    }
    if (dto.ownerId) await this.staff.assertExist([dto.ownerId], undefined, 'ownerId');
    const { request, rest } = splitAccess(dto);
    const { expectedClose, ...fields } = rest;
    let title = '';
    const outcome = await this.inTransaction(async (session) => {
      const lead = await this.leadModel.findById(id).session(session);
      if (!lead) throw new NotFoundException('Lead not found');
      if (lead.projectId && dto.value !== undefined && round2(dto.value) !== lead.value) {
        throw new ConflictException(
          'Lead is converted; its value follows the project contract value',
        );
      }
      // Aliased DTO fields are always present (possibly undefined); never let them unset data.
      lead.set(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)));
      if (expectedClose !== undefined) {
        lead.expectedClose = expectedClose ? parseDateOnly(expectedClose) : null;
      }
      const access = await this.resolveClientAccess(lead, request, lead.company, session);
      if (access.changed) lead.set(access.state);
      await lead.save({ session });
      title = lead.title;
      return access;
    });
    return this.afterSave(id, title, outcome, actor);
  }

  /** Same rules as the access fields of PATCH /leads/:id. */
  setClientAccess(
    id: string,
    dto: LeadClientAccessDto,
    actor: AuthUser,
  ): Promise<LeadSaveResponse> {
    return this.update(id, dto, actor);
  }

  private async inTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    let result!: T;
    try {
      // Callbacks must be retry-safe: withTransaction re-runs them on transient errors.
      await session.withTransaction(async () => {
        result = await fn(session);
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  /**
   * Final portal-access state for a create/update (omitted fields keep their current value):
   * - customerId links an existing customer (400 if unknown); customerId and newClient together → 400
   * - newClient reuses the live customer with that phone, or creates one (company = the lead's)
   * - neither (customerId: null) unlinks and forces both flags off
   * - showValueToClient: true requires visibleToClient (400); hiding the lead also hides the value
   * - a converted lead stays linked to its project's customer (409 on change)
   * - newClient and sendWhatsapp make sure the customer has a portal login (created if missing)
   * - sendWhatsapp requires a linked customer with a phone (400)
   */
  private async resolveClientAccess(
    current: Pick<
      Lead,
      'customerId' | 'visibleToClient' | 'showValueToClient' | 'projectId'
    > | null,
    req: AccessRequest,
    company: string,
    session: ClientSession,
  ): Promise<AccessOutcome> {
    const newClient = req.newClient ?? null;
    if (newClient && req.customerId) {
      throw new BadRequestException('Send either customerId or newClient, not both');
    }
    const changed =
      req.customerId !== undefined ||
      !!newClient ||
      req.visibleToClient !== undefined ||
      req.showValueToClient !== undefined;
    const currentCustomer = idOf(current?.customerId ?? null);

    let customer: Customer | null = null;
    let createdCustomer = false;
    if (newClient) {
      ({ customer, created: createdCustomer } = await this.findOrCreateClient(
        newClient,
        company,
        session,
      ));
    } else {
      const customerId = req.customerId === undefined ? currentCustomer : req.customerId;
      if (customerId) {
        customer = await this.customerModel.findById(customerId).session(session).lean();
        if (!customer) throw new BadRequestException('customerId does not reference a customer');
      }
    }
    const customerId = idOf(customer?._id ?? null);

    if (current?.projectId && customerId !== currentCustomer) {
      throw new ConflictException(
        "Lead is converted; its client account follows the project's customer",
      );
    }
    let state: AccessState = { customerId: null, visibleToClient: false, showValueToClient: false };
    if (customerId) {
      const visible = req.visibleToClient ?? current?.visibleToClient ?? false;
      if (req.showValueToClient && !visible) {
        throw new BadRequestException('showValueToClient requires visibleToClient');
      }
      state = {
        customerId,
        visibleToClient: visible,
        showValueToClient:
          visible && (req.showValueToClient ?? current?.showValueToClient ?? false),
      };
    }

    const sendWhatsapp = !!req.sendWhatsapp;
    if (sendWhatsapp && !customer) {
      throw new BadRequestException('sendWhatsapp requires a client (customerId or newClient)');
    }
    if (sendWhatsapp && !customer!.phone) {
      throw new BadRequestException('sendWhatsapp: this client has no phone number');
    }
    const login =
      customer && (newClient || sendWhatsapp) ? await this.ensureLogin(customer, session) : null;
    return { changed, state, customer, createdCustomer, login, sendWhatsapp };
  }

  /** Dedupe by normalised phone among live customers; otherwise create one. */
  private async findOrCreateClient(
    client: NewClientDto,
    company: string,
    session: ClientSession,
  ): Promise<{ customer: Customer; created: boolean }> {
    const existing = await this.customerModel
      .findOne({ phone: client.phone })
      .session(session)
      .lean();
    if (existing) return { customer: existing, created: false };
    const [created] = await this.customerModel.create(
      [
        {
          name: company || client.name,
          contactName: client.name,
          phone: client.phone,
          email: client.email ?? '',
        },
      ],
      { session },
    );
    return { customer: created.toObject(), created: true };
  }

  /**
   * Gives the customer a CUSTOMER login (phone sign-in; email too when it's free) unless it
   * already has one, or has neither. Returns the temporary password of a new login.
   */
  private async ensureLogin(customer: Customer, session: ClientSession): Promise<LoginOutcome> {
    const customerId = idOf(customer._id)!;
    if (await this.users.customerHasLogin(customerId, session)) {
      return { created: false, email: null, temporaryPassword: null };
    }
    const email =
      customer.email && !(await this.users.emailExists(customer.email, session))
        ? customer.email
        : null;
    // Nothing to sign in with: don't create an unusable account.
    if (!customer.phone && !email) return { created: false, email: null, temporaryPassword: null };
    const temporaryPassword = generateTemporaryPassword();
    await this.users.createCustomerLogin(
      { name: customer.contactName || customer.name, email, customerId },
      temporaryPassword,
      session,
    );
    return { created: true, email, temporaryPassword };
  }

  /** Post-commit side effects (log, WhatsApp) and the response. */
  private async afterSave(
    id: string,
    title: string,
    outcome: AccessOutcome,
    actor: AuthUser,
  ): Promise<LeadSaveResponse> {
    const { customer, login } = outcome;
    if (outcome.changed) this.logAccess(id, outcome.state, actor);
    if (outcome.createdCustomer) {
      this.logger.log(`Lead ${id}: created customer ${idOf(customer!._id)} by ${actor.email}`);
    }
    const response: LeadSaveResponse = await this.get(id);
    if (customer && login?.created) {
      const isProduction = this.config.get('NODE_ENV', { infer: true }) === 'production';
      response.invite = {
        phone: customer.phone ?? null,
        email: login.email,
        ...(isProduction ? {} : { temporaryPassword: login.temporaryPassword! }),
      };
    }
    if (outcome.sendWhatsapp && customer) {
      const message = await this.whatsapp.enqueueClientInvite({
        leadId: id,
        customerId: idOf(customer._id)!,
        phone: customer.phone!,
        name: customer.contactName || customer.name,
        title,
        newAccount: !!login?.created,
        temporaryPassword: login?.temporaryPassword ?? null,
      });
      response.whatsapp = message ? { id: message.id, status: message.status } : null;
    }
    return response;
  }

  private logAccess(id: string, access: AccessState, actor: AuthUser): void {
    this.logger.log(
      `Lead ${id} client access by ${actor.email}: customer=${access.customerId ?? 'none'} ` +
        `visible=${access.visibleToClient} showValue=${access.showValueToClient}`,
    );
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
    const lead = await this.leadModel.findById(id).select('stage projectId quote').lean();
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.projectId || lead.stage === 'WON') {
      throw new ConflictException('Lead has been converted to a project and is locked');
    }
    if (lead.stage === stage) return this.get(id);
    if (stage === 'PROPOSAL' && !lead.quote) {
      throw new BadRequestException(QUOTE_REQUIRED);
    }

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
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const deleted = await this.leadModel.findOneAndUpdate(
          { _id: id, projectId: { $exists: false } },
          { $set: { deletedAt: new Date() } },
          { session },
        );
        if (!deleted) throw new ConflictException('Converted leads cannot be deleted');
        await this.workLogs.removeFor({ leadId: id }, session);
      });
    } finally {
      await session.endSession();
    }
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
    let invite: {
      phone: string | null;
      email: string | null;
      password: string;
      customerName: string;
    } | null = null;

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

        // A lead already linked to a client converts for that client (same portal login).
        const linked = idOf(lead.customerId ?? null);
        if (linked && dto.customerId && dto.customerId !== linked) {
          throw new ConflictException(
            `Lead is linked to customer ${linked}; convert it for that customer or change the link first`,
          );
        }
        const requested = linked ?? dto.customerId;
        if (!requested) {
          throw new BadRequestException('customerId is required (a customer id or "NEW")');
        }
        let customer: Customer | null;
        if (requested === 'NEW') {
          // Reuse the live customer that already has this phone, like newClient does.
          const phone = normalizePhone(lead.phone);
          customer = phone
            ? await this.customerModel.findOne({ phone }).session(session).lean()
            : null;
          customer ??= (
            await this.customerModel.create(
              [
                {
                  name: lead.company,
                  contactName: lead.contactName,
                  email: lead.email,
                  phone,
                },
              ],
              { session },
            )
          )[0].toObject();
          const login = await this.ensureLogin(customer, session);
          if (login.created) {
            invite = {
              phone: customer.phone ?? null,
              email: login.email,
              password: login.temporaryPassword!,
              customerName: customer.name,
            };
          }
        } else {
          customer = await this.customerModel.findById(requested).session(session).lean();
          if (!customer) throw new BadRequestException('customerId does not reference a customer');
        }
        const customerId = idOf(customer._id)!;
        clientName = customer.name;

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
              plan: dto.plan,
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
      `Lead ${id} converted to project ${project.id} by ${actor.email} ` +
        `(plan ${dto.plan}, contract ${dto.contractValue})`,
    );
    const result: ConvertLeadResult = toProjectResponse(project.toObject(), clientName);
    const sent = invite as {
      phone: string | null;
      email: string | null;
      password: string;
      customerName: string;
    } | null;
    if (sent) {
      if (sent.email) this.users.sendInvite(sent.email, sent.customerName);
      result.invite = {
        phone: sent.phone,
        email: sent.email,
        ...(isProduction ? {} : { temporaryPassword: sent.password }),
      };
    }
    return result;
  }
}
