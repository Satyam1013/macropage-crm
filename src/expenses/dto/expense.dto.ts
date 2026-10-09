import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../../common/constants/enums';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Alias, IsDateOnly, IsMoney } from '../../common/dto/validators';

export class ExpenseLineDto {
  @ApiProperty({ enum: EXPENSE_CATEGORIES })
  @IsIn(EXPENSE_CATEGORIES)
  category: ExpenseCategory;

  @ApiProperty({ minimum: 0.01, example: 25000 })
  @IsMoney({ positive: true })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** One project + one staff member + one date, with several category lines. */
export class CreateExpenseBatchDto {
  @IsMongoId()
  projectId: string;

  /** Staff member the expenses belong to (`userId` accepted as an alias). */
  @Alias('userId')
  @IsMongoId()
  staffId: string;

  @ApiProperty({ example: '2026-10-05' })
  @Alias('date')
  @IsDateOnly()
  spentOn: string;

  @ApiProperty({ type: [ExpenseLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ExpenseLineDto)
  lines: ExpenseLineDto[];
}

export class UpdateExpenseDto {
  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES })
  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: ExpenseCategory;

  @ApiPropertyOptional({ minimum: 0.01 })
  @IsOptional()
  @IsMoney({ positive: true })
  amount?: number;

  @ApiPropertyOptional({ example: '2026-10-05' })
  @IsOptional()
  @Alias('date')
  @IsDateOnly()
  spentOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Alias('userId')
  @IsMongoId()
  staffId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ListExpensesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES })
  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: ExpenseCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @Alias('userId')
  @IsMongoId()
  staffId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Inclusive' })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Inclusive' })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}
