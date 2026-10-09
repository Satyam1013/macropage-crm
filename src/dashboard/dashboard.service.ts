import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { LEAD_STAGES, LeadStage } from '../common/constants/enums';
import type { SoftDeleteModel } from '../common/plugins/soft-delete.plugin';
import { round2 } from '../common/utils/money.util';
import { FinanceService, MonthlyPoint } from '../finance/finance.service';
import { LeadResponse, toLeadResponse } from '../leads/lead.mapper';
import { Lead } from '../leads/schemas/lead.schema';
import type { ProjectResponse } from '../projects/project.mapper';
import { ProjectsService } from '../projects/projects.service';
import { Project } from '../projects/schemas/project.schema';

export interface DashboardResponse {
  counts: {
    leads: number;
    confirmedLeads: number;
    projectsRunning: number;
    projectsOngoing: number;
    projectsClosed: number;
    awaitingClient: number;
  };
  money: { revenue: number; booked: number; expenses: number; net: number };
  funnel: { stage: LeadStage; count: number }[];
  runningProjects: ProjectResponse[];
  confirmedDeals: LeadResponse[];
  recentLeads: LeadResponse[];
  monthly: MonthlyPoint[];
}

const LIST_LIMIT = 5;

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: SoftDeleteModel<Lead>,
    @InjectModel(Project.name) private readonly projectModel: SoftDeleteModel<Project>,
    private readonly finance: FinanceService,
    private readonly projects: ProjectsService,
  ) {}

  async get(): Promise<DashboardResponse> {
    const [
      leads,
      confirmedLeads,
      projectsRunning,
      projectsOngoing,
      projectsClosed,
      awaitingClient,
      totals,
      funnelRows,
      running,
      confirmedDeals,
      recentLeads,
      monthly,
    ] = await Promise.all([
      this.leadModel.countDocuments(),
      this.leadModel.countDocuments({ stage: 'WON' }),
      this.projectModel.countDocuments({ stage: { $ne: 'CLOSED' } }),
      this.projectModel.countDocuments({ stage: { $nin: ['INITIATE', 'CLOSED'] } }),
      this.projectModel.countDocuments({ stage: 'CLOSED' }),
      this.projectModel.countDocuments({ stage: 'CLIENT_CONFIRMATION' }),
      this.finance.totals(),
      this.leadModel.aggregate<{ _id: LeadStage; count: number }>([
        { $group: { _id: '$stage', count: { $sum: 1 } } },
      ]),
      this.projects.list({ status: 'running' }),
      this.leadModel
        .find({ stage: 'WON' })
        .select('-stageHistory')
        .sort({ wonAt: -1 })
        .limit(LIST_LIMIT)
        .lean(),
      this.leadModel
        .find()
        .select('-stageHistory')
        .sort({ createdAt: -1 })
        .limit(LIST_LIMIT)
        .lean(),
      this.finance.monthly(6),
    ]);

    const funnelMap = new Map(funnelRows.map((r) => [r._id, r.count]));
    return {
      counts: {
        leads,
        confirmedLeads,
        projectsRunning,
        projectsOngoing,
        projectsClosed,
        awaitingClient,
      },
      money: { ...totals, net: round2(totals.revenue - totals.expenses) },
      funnel: LEAD_STAGES.map((stage) => ({ stage, count: funnelMap.get(stage) ?? 0 })),
      runningProjects: [...running].sort((a, b) =>
        (a.endDate ?? '').localeCompare(b.endDate ?? ''),
      ),
      confirmedDeals: confirmedDeals.map(toLeadResponse),
      recentLeads: recentLeads.map(toLeadResponse),
      monthly,
    };
  }
}
