import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { EnvironmentVariables } from '../config/env.validation';
import type { UserDocument } from '../users/schemas/user.schema';
import { toUserResponse, UserResponse } from '../users/user.mapper';
import { UsersService } from '../users/users.service';
import type { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import type { AccessTokenPayload } from './jwt.strategy';

interface RefreshTokenPayload {
  sub: string;
  typ: 'refresh';
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends TokenPair {
  user: UserResponse;
}

/**
 * Refresh tokens are stored as a SHA-256 digest. bcrypt is not usable here: it only reads the
 * first 72 bytes, and every JWT of a user shares its first 72 bytes (header + start of payload).
 */
function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Equalises timing between "unknown email" and "wrong password".
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.users.findByEmailWithSecrets(dto.email);
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      this.logger.warn(`Failed login for ${dto.email}`);
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) {
      this.logger.warn(`Login attempt on inactive account ${user.email}`);
      throw new ForbiddenException('This account is disabled');
    }
    if (user.role !== dto.role) {
      this.logger.warn(`Login role mismatch for ${user.email}: requested ${dto.role}`);
      throw new ForbiddenException(
        dto.role === 'ADMIN'
          ? 'This account is not an admin account. Use the Customer login.'
          : 'This account is not a customer account. Use the Admin login.',
      );
    }
    if (user.role === 'CUSTOMER' && !user.customerId) {
      throw new ForbiddenException('This customer login is not linked to a customer');
    }

    const tokens = await this.issueTokens(user);
    this.logger.log(`Login: ${user.email} (${user.role})`);
    return { ...tokens, user: await this.profile(user) };
  }

  async refresh(refreshToken: string): Promise<LoginResponse> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException('Invalid refresh token');

    const user = await this.users.findByIdWithSecrets(payload.sub);
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Session has ended, please sign in again');
    }
    if (!safeEqual(user.refreshTokenHash, digest(refreshToken))) {
      // A rotated-out token was replayed: revoke the session entirely.
      await this.users.setRefreshTokenHash(user.id as string, null);
      this.logger.warn(`Refresh token reuse detected for ${user.email}; session revoked`);
      throw new UnauthorizedException('Session has ended, please sign in again');
    }
    const tokens = await this.issueTokens(user);
    return { ...tokens, user: await this.profile(user) };
  }

  async logout(actor: AuthUser): Promise<{ message: string }> {
    await this.users.setRefreshTokenHash(actor.id, null);
    this.logger.log(`Logout: ${actor.email}`);
    return { message: 'Logged out' };
  }

  async me(actor: AuthUser): Promise<UserResponse> {
    const user = await this.users.findById(actor.id);
    if (!user) throw new UnauthorizedException();
    return this.profile(user);
  }

  async changePassword(actor: AuthUser, dto: ChangePasswordDto): Promise<LoginResponse> {
    const user = await this.users.findByIdWithSecrets(actor.id);
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new ForbiddenException('New password must differ from the current password');
    }
    await this.users.setPassword(actor.id, dto.newPassword);
    this.logger.log(`Password changed: ${user.email}`);
    // Other sessions are revoked by setPassword; issue a fresh pair for this one.
    const tokens = await this.issueTokens(user);
    return { ...tokens, user: await this.profile(user) };
  }

  private async profile(user: UserDocument): Promise<UserResponse> {
    const customerName =
      user.role === 'CUSTOMER' ? await this.users.customerName(user.customerId) : null;
    return toUserResponse(user.toObject(), customerName);
  }

  private async issueTokens(user: UserDocument): Promise<TokenPair> {
    const sub = user.id as string;
    const access: AccessTokenPayload = { sub, role: user.role, typ: 'access' };
    const refresh: RefreshTokenPayload = { sub, typ: 'refresh', jti: randomUUID() };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(access, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      }),
      this.jwt.signAsync(refresh, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }),
      }),
    ]);
    await this.users.setRefreshTokenHash(sub, digest(refreshToken));
    return { accessToken, refreshToken };
  }
}
