import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { PAYMENT_MODES, PaymentMode } from '../../common/constants/enums';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Alias, IsDateOnly, IsMoney } from '../../common/dto/validators';

export class CreatePaymentDto {
  @IsMongoId()
  projectId: string;

  @ApiProperty({ minimum: 0.01, example: 150000 })
  @IsMoney({ positive: true })
  amount: number;

  /** Payment date (stored as `paidOn`; `paidOn` is accepted as an alias). */
  @ApiProperty({ example: '2026-10-01' })
  @Alias('paidOn')
  @IsDateOnly()
  date: string;

  @ApiProperty({ enum: PAYMENT_MODES })
  @IsIn(PAYMENT_MODES)
  mode: PaymentMode;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdatePaymentDto extends PartialType(
  OmitType(CreatePaymentDto, ['projectId'] as const),
) {}

export class ListPaymentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Inclusive' })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Inclusive' })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}
