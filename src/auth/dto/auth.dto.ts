import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsJWT,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Role, ROLES } from '../../common/constants/enums';
import { IsPhone } from '../../common/dto/validators';

/** ADMIN: { email, password }. CUSTOMER: { phone, password }, or email for older accounts. */
export class LoginDto {
  @ApiPropertyOptional({ example: 'admin@macropage.in' })
  @ValidateIf((o: LoginDto) => o.role !== 'CUSTOMER' || o.phone === undefined)
  @IsEmail()
  email?: string;

  /** Normalised the same way as the customer's phone. */
  @ApiPropertyOptional({ example: '9876543210' })
  @ValidateIf((o: LoginDto) => o.role === 'CUSTOMER' && o.phone !== undefined)
  @IsPhone()
  phone?: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  /** Which login tab the user picked (Admin / Customer). */
  @ApiProperty({ enum: ROLES, example: 'ADMIN' })
  @IsIn(ROLES)
  role: Role;
}

export class RefreshTokenDto {
  @IsJWT()
  refreshToken: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}
