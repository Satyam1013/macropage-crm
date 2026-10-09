import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/** Debug-level access log: `GET /api/leads 200 12ms`. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    return next.handle().pipe(
      tap(() => {
        const res = http.getResponse<Response>();
        this.logger.debug(
          `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`,
        );
      }),
    );
  }
}
