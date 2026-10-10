import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Staff, StaffSchema } from '../staff/schemas/staff.schema';
import { WorkLog, WorkLogSchema } from './schemas/work-log.schema';
import { WorkLogsController } from './work-logs.controller';
import { WorkLogsService } from './work-logs.service';

/** Uses models directly (not StaffModule) so Staff and Leads can import this module. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkLog.name, schema: WorkLogSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Staff.name, schema: StaffSchema },
    ]),
  ],
  controllers: [WorkLogsController],
  providers: [WorkLogsService],
  exports: [WorkLogsService],
})
export class WorkLogsModule {}
