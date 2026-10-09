import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { STAFF_TYPES, StaffType } from '../../common/constants/enums';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Trim } from '../../common/dto/validators';

export class CreateStaffDto {
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  /** Job title, e.g. "Backend Engineer". */
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(120)
  role: string;

  @ApiProperty({ enum: STAFF_TYPES })
  @IsIn(STAFF_TYPES)
  type: StaffType;

  @IsOptional()
  @ValidateIf((o: CreateStaffDto) => o.email !== null && o.email !== '')
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStaffDto extends PartialType(CreateStaffDto) {}

export class ListStaffQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STAFF_TYPES })
  @IsOptional()
  @IsIn(STAFF_TYPES)
  type?: StaffType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;
}
