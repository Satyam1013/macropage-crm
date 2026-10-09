import { ApiProperty, ApiPropertyOptional, OmitType, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { LEAD_STAGES, LeadStage } from '../../common/constants/enums';
import { Alias, IsDateOnly, IsMoney, Trim } from '../../common/dto/validators';

export class CreateLeadDto {
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(160)
  company: string;

  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @ValidateIf((o: CreateLeadDto) => o.email !== '')
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(80)
  source?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsMoney()
  value?: number;

  /** Staff id of the owner. The frontend's `owner` key is accepted as an alias. */
  @Alias('owner')
  @IsMongoId()
  ownerId: string;

  @ApiPropertyOptional({ enum: LEAD_STAGES, default: 'LEAD', description: 'Any stage except WON' })
  @IsOptional()
  @IsIn(LEAD_STAGES)
  stage?: LeadStage;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @ValidateIf((o: CreateLeadDto) => o.expectedClose !== null)
  @IsDateOnly()
  expectedClose?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  /** Customer account the lead is shared with in the portal; null unlinks (and hides) it. */
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsMongoId()
  customerId?: string | null;

  /** Show the lead under "My Discussions" in the customer's portal. Requires customerId. */
  @IsOptional()
  @IsBoolean()
  visibleToClient?: boolean;

  /** Include the deal value in the customer's discussion view. */
  @IsOptional()
  @IsBoolean()
  showValueToClient?: boolean;
}

/** Stage is changed only through PATCH /leads/:id/stage. */
export class UpdateLeadDto extends PartialType(OmitType(CreateLeadDto, ['stage'] as const)) {}

export class LeadClientAccessDto extends PickType(CreateLeadDto, [
  'customerId',
  'visibleToClient',
  'showValueToClient',
] as const) {}

export class UpdateLeadStageDto {
  @ApiProperty({ enum: LEAD_STAGES })
  @IsIn(LEAD_STAGES)
  stage: LeadStage;
}

export class ListLeadsQueryDto {
  @ApiPropertyOptional({ enum: LEAD_STAGES })
  @IsOptional()
  @IsIn(LEAD_STAGES)
  stage?: LeadStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @ApiPropertyOptional({ description: 'Matches title, company or contact name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ConvertLeadDto {
  @ApiProperty({ minimum: 0.01, example: 450000 })
  @IsMoney({ positive: true })
  contractValue: number;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateOnly()
  startDate: string;

  @ApiProperty({ example: '2027-02-28' })
  @IsDateOnly()
  endDate: string;

  /** An existing customer id, or "NEW" to create one from the lead's company/contact. */
  @ApiProperty({ example: 'NEW', description: 'Customer ObjectId or "NEW"' })
  @Transform(({ value }) =>
    typeof value === 'string' && value.toUpperCase() === 'NEW' ? 'NEW' : value,
  )
  @Matches(/^(NEW|[a-f\d]{24})$/i, { message: 'customerId must be an ObjectId or "NEW"' })
  customerId: string;

  @ApiPropertyOptional({ description: 'Project name; defaults to the lead title' })
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

  @ApiProperty({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  staffIds: string[] = [];
}
