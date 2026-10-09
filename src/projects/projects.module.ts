import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { ExpensesModule } from '../expenses/expenses.module';
import { FinanceModule } from '../finance/finance.module';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { PaymentsModule } from '../payments/payments.module';
import { StaffModule } from '../staff/staff.module';
import { UsersModule } from '../users/users.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project, ProjectSchema } from './schemas/project.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
    StaffModule,
    UsersModule,
    FinanceModule,
    PaymentsModule,
    ExpensesModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
