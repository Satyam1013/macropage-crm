import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { StaffModule } from '../staff/staff.module';
import { UsersModule } from '../users/users.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { WorkLogsModule } from '../work-logs/work-logs.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { Lead, LeadSchema } from './schemas/lead.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    StaffModule,
    UsersModule,
    WorkLogsModule,
    WhatsappModule,
  ],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
