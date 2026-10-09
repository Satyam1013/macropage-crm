import { PartialType } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../common/dto/validators';

export class CreateCustomerDto {
  /** Company name. */
  @IsString()
  @Trim()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @ValidateIf((o: CreateCustomerDto) => o.email !== '')
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(500)
  address?: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
