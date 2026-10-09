import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Role, ROLES } from '../../common/constants/enums';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Trim } from '../../common/dto/validators';

export class CreateUserDto {
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role: Role;

  /** Required when role is CUSTOMER. */
  @ValidateIf((o: CreateUserDto) => o.role === 'CUSTOMER' || o.customerId !== undefined)
  @IsMongoId()
  customerId?: string;

  /** Optional; a temporary password is generated (and returned once) when omitted. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetPasswordDto {
  /** Optional; a temporary password is generated and returned when omitted. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;
}
