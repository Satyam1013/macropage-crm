import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExpensesModule } from '../expenses/expenses.module';
import { Expense, ExpenseSchema } from '../expenses/schemas/expense.schema';
import { InternalProjectsController } from './internal-projects.controller';
import { InternalProjectsService } from './internal-projects.service';
import { InternalProject, InternalProjectSchema } from './schemas/internal-project.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InternalProject.name, schema: InternalProjectSchema },
      { name: Expense.name, schema: ExpenseSchema },
    ]),
    ExpensesModule,
  ],
  controllers: [InternalProjectsController],
  providers: [InternalProjectsService],
})
export class InternalProjectsModule {}
