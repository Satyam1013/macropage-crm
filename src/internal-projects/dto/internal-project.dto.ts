import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { INTERNAL_PROJECT_STATUSES, InternalProjectStatus } from '../../common/constants/enums';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { IsDateOnly, IsMoney, Trim } from '../../common/dto/validators';

export class CreateInternalProjectDto {
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({ enum: INTERNAL_PROJECT_STATUSES, default: 'ACTIVE' })
  @IsOptional()
  @IsIn(INTERNAL_PROJECT_STATUSES)
  status?: InternalProjectStatus;

  /** 0 or more; null clears it. */
  @ApiPropertyOptional({ minimum: 0, nullable: true, type: Number, example: 50000 })
  @IsOptional()
  @IsMoney()
  budget?: number | null;

  @ApiPropertyOptional({ example: '2026-10-01', nullable: true, type: String })
  @IsOptional()
  @ValidateIf((o: CreateInternalProjectDto) => o.startDate !== null)
  @IsDateOnly()
  startDate?: string | null;

  /** Must not be before startDate. */
  @ApiPropertyOptional({ example: '2026-12-31', nullable: true, type: String })
  @IsOptional()
  @ValidateIf((o: CreateInternalProjectDto) => o.endDate !== null)
  @IsDateOnly()
  endDate?: string | null;
}

export class UpdateInternalProjectDto extends PartialType(CreateInternalProjectDto) {}

export class ListInternalProjectsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: INTERNAL_PROJECT_STATUSES })
  @IsOptional()
  @IsIn(INTERNAL_PROJECT_STATUSES)
  status?: InternalProjectStatus;
}
