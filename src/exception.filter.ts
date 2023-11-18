import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { BaseError } from './errors/common.error';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: BaseError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();

    response.status(status).json({
      createdAt: new Date().toISOString(),
      statusCode: status,
      code: exception.code,
      message: exception.message,
    });
  }
}
