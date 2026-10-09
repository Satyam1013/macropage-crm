import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsJWT, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Role, ROLES } from '../../common/constants/enums';

export class LoginDto {
  @ApiProperty({ example: 'admin@macropage.in' })
  @IsEmail()
  email: string;

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
