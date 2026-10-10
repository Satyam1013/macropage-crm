import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  InternalProject,
  InternalProjectSchema,
} from '../internal-projects/schemas/internal-project.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Staff, StaffSchema } from '../staff/schemas/staff.schema';
import { StaffModule } from '../staff/staff.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { Expense, ExpenseSchema } from './schemas/expense.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Expense.name, schema: ExpenseSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: InternalProject.name, schema: InternalProjectSchema },
      { name: Staff.name, schema: StaffSchema },
    ]),
    StaffModule,
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
