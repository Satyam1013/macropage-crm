import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '../common/constants/enums';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { idOf } from '../common/utils/object-id.util';
import type { EnvironmentVariables } from '../config/env.validation';
import { UsersService } from '../users/users.service';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  typ: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  /** Re-reads the user each request so deactivated / deleted accounts lose access immediately. */
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    if (payload.typ !== 'access') throw new UnauthorizedException('Invalid token');
    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException('Account is inactive');
    return {
      id: user.id as string,
      email: user.email,
      name: user.name,
      role: user.role,
      customerId: idOf(user.customerId),
    };
  }
}
