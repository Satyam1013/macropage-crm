import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export const NODE_ENVS = ['development', 'production', 'test'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export class EnvironmentVariables {
  @IsIn(NODE_ENVS)
  NODE_ENV: NodeEnv = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 4000;

  @IsString()
  @MinLength(10)
  MONGODB_URI: string;

  @IsString()
  @MinLength(16, { message: 'JWT_ACCESS_SECRET must be at least 16 characters' })
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(16, { message: 'JWT_REFRESH_SECRET must be at least 16 characters' })
  JWT_REFRESH_SECRET: string;

  /** Access token lifetime in seconds (default 15 minutes). */
  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL = 900;

  /** Refresh token lifetime in seconds (default 7 days). */
  @Type(() => Number)
  @IsInt()
  @Min(300)
  JWT_REFRESH_TTL = 604800;

  /** Comma-separated list of allowed origins. */
  @IsString()
  CORS_ORIGIN = 'http://localhost:5173';

  /** Rate limit for /auth routes: max requests per window. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 10;

  /** Rate limit window for /auth routes in milliseconds. */
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  THROTTLE_TTL = 60000;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  SWAGGER_ENABLED?: boolean;

  /**
   * Reverse-proxy hops to trust for the client IP (rate limiting). Defaults to 1 in production
   * (Render, Railway, nginx…) and 0 elsewhere.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  TRUST_PROXY?: number;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return validated;
}
