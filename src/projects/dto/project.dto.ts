import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  PROJECT_PLANS,
  PROJECT_STAGES,
  ProjectPlan,
  ProjectStage,
} from '../../common/constants/enums';
import { IsDateOnly, IsMoney, Trim } from '../../common/dto/validators';
import { clampPercent } from '../project-progress';

export const PROJECT_STATUSES = ['running', 'closed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export class ListProjectsQueryDto {
  @ApiPropertyOptional({ enum: PROJECT_STAGES })
  @IsOptional()
  @IsIn(PROJECT_STAGES)
  stage?: ProjectStage;

  @ApiPropertyOptional({ enum: PROJECT_STATUSES, description: 'running = not CLOSED' })
  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: ProjectStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Matches project name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  requirements?: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateOnly()
  startDate?: string;

  @ApiPropertyOptional({ example: '2027-02-28' })
  @IsOptional()
  @IsDateOnly()
  endDate?: string;

  @ApiPropertyOptional({ minimum: 0.01 })
  @IsOptional()
  @IsMoney({ positive: true })
  contractValue?: number;

  @ApiPropertyOptional({ enum: PROJECT_PLANS })
  @IsOptional()
  @IsIn(PROJECT_PLANS)
  plan?: ProjectPlan;
}

export class UpdateProjectStageDto {
  @ApiProperty({ enum: PROJECT_STAGES })
  @IsIn(PROJECT_STAGES)
  stage: ProjectStage;
}

const ClampPercent = () =>
  Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? clampPercent(n) : value;
  });

/** Each track is clamped to 0–100 (rounded). Omitted tracks are left unchanged. */
export class UpdateProgressDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @ClampPercent()
  @IsNumber()
  requirement?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @ClampPercent()
  @IsNumber()
  ui?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @ClampPercent()
  @IsNumber()
  frontend?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @ClampPercent()
  @IsNumber()
  backend?: number;
}

export class SetTeamDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  staffIds: string[];
}
