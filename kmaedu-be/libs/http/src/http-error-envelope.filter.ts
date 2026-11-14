import { randomUUID } from 'crypto';
import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';
import type { Observable } from 'rxjs';

export interface ErrorEnvelope {
    statusCode: number;
    code: string;
    message: string;
    requestId: string;
}

const UPPER_SNAKE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

function defaultCode(statusCode: number): string {
    return HttpStatus[statusCode] ?? `HTTP_${statusCode}`;
}

function textOf(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value) return value;
    if (Array.isArray(value) && value.length) return value.join('; ');
    return fallback;
}

/**
 * Normalises every error to `{ statusCode, code, message, requestId }`.
 * Registered by gateway + auth in phase 05; other services register it when a
 * later phase touches them. HTTP only: other contexts re-throw untouched.
 */
@Catch()
export class HttpErrorEnvelopeFilter implements ExceptionFilter {
    private readonly rpc = new BaseRpcExceptionFilter();

    catch(exception: unknown, host: ArgumentsHost): Observable<unknown> | void {
        // Hybrid apps (HTTP + gRPC) inherit global filters; RPC errors keep
        // Nest's own mapping (RpcException payload -> gRPC status).
        if (host.getType() !== 'http') return this.rpc.catch(exception, host);

        const ctx = host.switchToHttp();
        const req = ctx.getRequest<Request>();
        const res = ctx.getResponse<Response>();

        const header = req?.headers?.['x-request-id'];
        const requestId =
            (Array.isArray(header) ? header[0] : header) ||
            `req_${randomUUID().replace(/-/g, '')}`;

        const body = this.toEnvelope(exception, requestId);
        res.status(body.statusCode).json(body);
    }

    private toEnvelope(exception: unknown, requestId: string): ErrorEnvelope {
        if (!(exception instanceof HttpException)) {
            return {
                statusCode: 500,
                code: defaultCode(500),
                message: 'Internal server error',
                requestId,
            };
        }
        const statusCode = exception.getStatus();
        const response = exception.getResponse();
        const obj =
            typeof response === 'object' && response !== null
                ? (response as Record<string, unknown>)
                : {};
        const code =
            typeof obj.code === 'string' && UPPER_SNAKE.test(obj.code)
                ? obj.code
                : defaultCode(statusCode);
        const message = textOf(
            typeof response === 'string' ? response : obj.message,
            exception.message
        );
        return { statusCode, code, message, requestId };
    }
}
