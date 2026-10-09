import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Error as MongooseError } from 'mongoose';

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

interface MongoServerErrorLike {
  name?: string;
  code?: number;
  keyValue?: Record<string, unknown>;
}

function reason(status: number): string {
  const name = HttpStatus[status];
  return name
    ? name
        .split('_')
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(' ')
    : 'Error';
}

/**
 * Normalises every error into `{ statusCode, message, error }`.
 * - HttpException → as thrown
 * - Mongo duplicate key (11000) → 409
 * - Mongoose CastError / ValidationError → 400
 * - anything else → 500 (logged, details hidden)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }
    res.status(body.statusCode).json(body);
  }

  toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return { statusCode: status, message: response, error: reason(status) };
      }
      const r = response as Partial<ErrorBody>;
      return {
        statusCode: status,
        message: r.message ?? exception.message,
        error: typeof r.error === 'string' ? r.error : reason(status),
      };
    }

    const mongo = exception as MongoServerErrorLike;
    if (mongo && mongo.code === 11000) {
      const fields = Object.keys(mongo.keyValue ?? {});
      return {
        statusCode: HttpStatus.CONFLICT,
        message: fields.length
          ? `A record with this ${fields.join(', ')} already exists`
          : 'Duplicate record',
        error: reason(HttpStatus.CONFLICT),
      };
    }

    if (exception instanceof MongooseError.CastError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Invalid value for ${exception.path}`,
        error: reason(HttpStatus.BAD_REQUEST),
      };
    }

    if (exception instanceof MongooseError.ValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: Object.values(exception.errors).map((e) => e.message),
        error: reason(HttpStatus.BAD_REQUEST),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: reason(HttpStatus.INTERNAL_SERVER_ERROR),
    };
  }
}
