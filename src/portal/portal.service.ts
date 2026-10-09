import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PaymentMode, PROJECT_STAGES, ProjectStage } from '../common/constants/enums';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { toDateOnly, toIso } from '../common/utils/date.util';
import { round2 } from '../common/utils/money.util';
import { idOf, toObjectId } from '../common/utils/object-id.util';
import { Payment } from '../payments/schemas/payment.schema';
import { computeProgress, DevTracks } from '../projects/project-progress';
import { toDev } from '../projects/project.mapper';
import { ProjectsService } from '../projects/projects.service';
import { Project } from '../projects/schemas/project.schema';

/**
 * Customer-facing projections. Deliberately excludes expenses, profit/margin, staff cost and
 * internal fields (lead, admin user ids, staff contact details).
 */
export interface PortalProjectSummary {
  id: string;
  name: string;
  clientName: string | null;
  description: string;
  stage: ProjectStage;
  progress: number;
  dev: DevTracks;
  startDate: string | null;
  endDate: string | null;
  clientApproved: boolean;
  clientNote: string | null;
  awaitingApproval: boolean;
  closedAt: string | null;
  contractValue: number;
  paid: number;
  balance: number;
}

export interface PortalProjectDetail extends PortalProjectSummary {
  requirements: string;
  timeline: { from: string | null; to: string; at: string | null }[];
  stages: { stage: ProjectStage; status: 'done' | 'current' | 'upcoming' }[];
  payments: {
    contract: number;
    paid: number;
    balance: number;
    list: {
      id: string;
      amount: number;
      date: string | null;
      mode: PaymentMode;
      note: string | null;
    }[];
  };
  team: { name: string; role: string }[];
}

@Injectable()
export class PortalService {
  constructor(
    @InjectModel(Project.name) private readonly projectModel: SoftDeleteModel<Project>,
    @InjectModel(Payment.name) private readonly paymentModel: SoftDeleteModel<Payment>,
    private readonly projects: ProjectsService,
  ) {}

  private customerIdOf(user: AuthUser): string {
    if (!user.customerId) throw new ForbiddenException('This login is not linked to a customer');
    return user.customerId;
  }

  async list(user: AuthUser): Promise<PortalProjectSummary[]> {
    const customerId = this.customerIdOf(user);
    const projects = await this.projectModel
      .find({ customerId })
      .select('-stageHistory -team -leadId')
      .sort({ createdAt: -1 })
      .lean();
    const ids = projects.map((p) => p._id);
    const [paid, names] = await Promise.all([
      this.paymentModel.aggregate<{ _id: unknown; total: number }>([
        { $match: { projectId: { $in: ids } } },
        { $group: { _id: '$projectId', total: { $sum: '$amount' } } },
      ]),
      this.projects.customerNames([customerId]),
    ]);
    const paidBy = new Map(paid.map((p) => [idOf(p._id as string), p.total]));
    return projects.map((p) =>
      this.summary(p, paidBy.get(idOf(p._id)) ?? 0, names.get(customerId) ?? null),
    );
  }

  async get(id: string, user: AuthUser): Promise<PortalProjectDetail> {
    const customerId = this.customerIdOf(user);
    // Scoped by customerId: another customer's project is indistinguishable from a missing one.
    const project = await this.projectModel.findOne({ _id: id, customerId }).lean();
    if (!project) throw new NotFoundException('Project not found');

    const [payments, team, names] = await Promise.all([
      this.paymentModel
        .find({ projectId: toObjectId(id) })
        .sort({ paidOn: -1 })
        .lean(),
      this.projects.teamMembers(project.team.map((t) => idOf(t)!)),
      this.projects.customerNames([customerId]),
    ]);
    const paid = payments.reduce((sum, p) => sum + p.amount, 0);
    const summary = this.summary(project, paid, names.get(customerId) ?? null);
    const currentIndex = PROJECT_STAGES.indexOf(project.stage);

    return {
      ...summary,
      requirements: project.requirements ?? '',
      timeline: (project.stageHistory ?? []).map((h) => ({
        from: h.from ?? null,
        to: h.to,
        at: toIso(h.at),
      })),
      stages: PROJECT_STAGES.map((stage, i) => ({
        stage,
        status:
          project.stage === 'CLOSED' || i < currentIndex
            ? 'done'
            : i === currentIndex
              ? 'current'
              : 'upcoming',
      })),
      payments: {
        contract: summary.contractValue,
        paid: summary.paid,
        balance: summary.balance,
        list: payments.map((p) => ({
          id: p._id.toHexString(),
          amount: p.amount,
          date: toDateOnly(p.paidOn),
          mode: p.mode,
          note: p.note ?? null,
        })),
      },
      team: team.map((m) => ({ name: m.name, role: m.role })),
    };
  }

  async approve(id: string, user: AuthUser): Promise<PortalProjectDetail> {
    await this.projects.approve(id, user, this.customerIdOf(user));
    return this.get(id, user);
  }

  async requestChanges(id: string, note: string, user: AuthUser): Promise<PortalProjectDetail> {
    await this.projects.requestChanges(id, note, user, this.customerIdOf(user));
    return this.get(id, user);
  }

  private summary(p: Project, paidRaw: number, clientName: string | null): PortalProjectSummary {
    const paid = round2(paidRaw);
    return {
      id: idOf(p._id)!,
      name: p.name,
      clientName,
      description: p.description ?? '',
      stage: p.stage,
      progress: computeProgress(p.stage, p.dev),
      dev: toDev(p.dev),
      startDate: toDateOnly(p.startDate),
      endDate: toDateOnly(p.endDate),
      clientApproved: !!p.clientApproved,
      clientNote: p.clientNote ?? null,
      awaitingApproval: p.stage === 'CLIENT_CONFIRMATION',
      closedAt: toIso(p.closedAt),
      contractValue: p.contractValue,
      paid,
      balance: round2(Math.max(p.contractValue - paid, 0)),
    };
  }
}
