import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_SCOPES,
  ExpenseCategory,
  ExpenseScope,
} from '../../common/constants/enums';
import { IsDateOnly } from '../../common/dto/validators';

export class MonthlyQueryDto {
  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 36 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  months: number = 6;
}

export class ExpenseBreakdownQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional({ enum: EXPENSE_SCOPES })
  @IsOptional()
  @IsIn(EXPENSE_SCOPES)
  scope?: ExpenseScope;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Inclusive (spentOn >= from)' })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Inclusive (spentOn <= to)' })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

export class ExpenseByCategoryQueryDto extends ExpenseBreakdownQueryDto {
  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES })
  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: ExpenseCategory;
}
