import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { IsPhone, Trim } from '../../common/dto/validators';

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

  /** Normalised to digits with country code; must be unique. '' or null clears it. */
  @ApiPropertyOptional({ example: '9876543210', nullable: true, type: String })
  @IsOptional()
  @IsPhone()
  phone?: string | null;

  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(500)
  address?: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
