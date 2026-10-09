import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ExpenseBreakdownQueryDto,
  ExpenseByCategoryQueryDto,
  MonthlyQueryDto,
} from './dto/finance-query.dto';
import { FinanceService } from './finance.service';

@ApiTags('Finance')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('summary')
  summary() {
    return this.finance.summary();
  }

  @Get('projects')
  projects() {
    return this.finance.projectRows();
  }

  @Get('monthly')
  monthly(@Query() query: MonthlyQueryDto) {
    return this.finance.monthly(query.months);
  }

  @Get('expenses/by-category')
  byCategory(@Query() query: ExpenseByCategoryQueryDto) {
    return this.finance.expensesByCategory(query);
  }

  @Get('expenses/by-user')
  byUser(@Query() query: ExpenseBreakdownQueryDto) {
    return this.finance.expensesByUser(query);
  }
}
