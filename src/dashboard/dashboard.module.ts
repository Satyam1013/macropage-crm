import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FinanceModule } from '../finance/finance.module';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { ProjectsModule } from '../projects/projects.module';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
    FinanceModule,
    ProjectsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
