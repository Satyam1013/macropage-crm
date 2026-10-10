import { ApiProperty, ApiPropertyOptional, OmitType, PartialType, PickType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { LEAD_STAGES, LeadStage, PROJECT_PLANS, ProjectPlan } from '../../common/constants/enums';
import { Alias, IsDateOnly, IsMoney, IsPhone, Trim } from '../../common/dto/validators';

/** Quoted price per plan; both are required and must be > 0. */
export class LeadQuoteDto {
  @ApiProperty({ minimum: 0.01, example: 25000 })
  @IsMoney({ positive: true })
  PRO: number;

  @ApiProperty({ minimum: 0.01, example: 40000 })
  @IsMoney({ positive: true })
  PREMIUM: number;
}

/** A client to create (or reuse, when a customer already has this phone) and link. */
export class NewClientDto {
  /** Contact person; also the login's display name. */
  @ApiProperty({ example: 'Rahul Shah' })
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  /** Normalised to digits with country code; the client's portal login. */
  @ApiProperty({ example: '9876543210' })
  @IsPhone()
  phone: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @ValidateIf((o: NewClientDto) => o.email !== '')
  @IsEmail()
  email?: string | null;
}

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

  /** Required before the lead can enter PROPOSAL. Cannot be cleared once set. */
  @ApiPropertyOptional({ type: LeadQuoteDto })
  @ValidateIf((o: CreateLeadDto) => o.quote !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => LeadQuoteDto)
  quote?: LeadQuoteDto;

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

  /** Create or reuse (by phone) a customer + portal login and link it. Excludes customerId. */
  @ApiPropertyOptional({ type: NewClientDto, nullable: true })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NewClientDto)
  newClient?: NewClientDto | null;

  /** Show the lead under "My Discussions" in the customer's portal. Ignored without a client. */
  @IsOptional()
  @IsBoolean()
  visibleToClient?: boolean;

  /** Include the deal value in the customer's discussion view. Requires visibleToClient. */
  @IsOptional()
  @IsBoolean()
  showValueToClient?: boolean;

  /** Queue a WhatsApp portal invite to the linked client's phone after saving. Not stored. */
  @IsOptional()
  @IsBoolean()
  sendWhatsapp?: boolean;
}

/** Stage is changed only through PATCH /leads/:id/stage. */
export class UpdateLeadDto extends PartialType(OmitType(CreateLeadDto, ['stage'] as const)) {}

export class LeadClientAccessDto extends PickType(CreateLeadDto, [
  'customerId',
  'newClient',
  'visibleToClient',
  'showValueToClient',
  'sendWhatsapp',
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

  /** The plan the client chose. contractValue is the final price, not derived from the quote. */
  @ApiProperty({ enum: PROJECT_PLANS })
  @IsIn(PROJECT_PLANS)
  plan: ProjectPlan;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateOnly()
  startDate: string;

  @ApiProperty({ example: '2027-02-28' })
  @IsDateOnly()
  endDate: string;

  /**
   * An existing customer id, or "NEW" to create one from the lead's company/contact (reusing
   * the customer that already has the lead's phone). Optional when the lead is already linked
   * to a customer; it must then match that customer (409).
   */
  @ApiPropertyOptional({ example: 'NEW', description: 'Customer ObjectId or "NEW"' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.toUpperCase() === 'NEW' ? 'NEW' : value,
  )
  @Matches(/^(NEW|[a-f\d]{24})$/i, { message: 'customerId must be an ObjectId or "NEW"' })
  customerId?: string;

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
