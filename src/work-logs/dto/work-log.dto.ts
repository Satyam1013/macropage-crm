import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  WORK_LOG_SCOPES,
  WORK_LOG_STATUSES,
  WorkLogScope,
  WorkLogStatus,
} from '../../common/constants/enums';
import { Trim } from '../../common/dto/validators';

/** `type` is checked against WORK_TYPES[scope] in the service. */
export class WorkLogItemDto {
  @ApiProperty({ enum: WORK_LOG_SCOPES })
  @IsIn(WORK_LOG_SCOPES)
  scope: WorkLogScope;

  @ApiProperty({ example: 'Frontend Development' })
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(80)
  type: string;
}

/** One row is created per item; all share staffId, status and note. */
export class CreateWorkLogsDto {
  @IsMongoId()
  staffId: string;

  @ApiPropertyOptional({ enum: WORK_LOG_STATUSES, default: 'IN_PROGRESS' })
  @IsOptional()
  @IsIn(WORK_LOG_STATUSES)
  status?: WorkLogStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;

  @ApiProperty({ type: [WorkLogItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WorkLogItemDto)
  items: WorkLogItemDto[];
}

export class UpdateWorkLogDto {
  @ApiPropertyOptional({ description: "Must belong to the log's scope" })
  @IsOptional()
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(80)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;

  @ApiPropertyOptional({ enum: WORK_LOG_STATUSES })
  @IsOptional()
  @IsIn(WORK_LOG_STATUSES)
  status?: WorkLogStatus;
}

export class ListWorkLogsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  staffId?: string;

  @ApiPropertyOptional({ enum: WORK_LOG_STATUSES })
  @IsOptional()
  @IsIn(WORK_LOG_STATUSES)
  status?: WorkLogStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  leadId?: string;
}
