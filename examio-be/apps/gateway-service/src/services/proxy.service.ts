import { Injectable, HttpException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { Request } from 'express';

export interface ProxyRequest {
    method: string;
    path: string;
    body?: any;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    cookies?: Record<string, string>;
}

@Injectable()
export class ProxyService {
    private readonly logger = new Logger(ProxyService.name);

    private readonly serviceUrls = {
        auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
        exam: process.env.EXAM_SERVICE_URL || 'http://localhost:3002',
        finance: process.env.FINANCE_SERVICE_URL || 'http://localhost:3003',
        admin: process.env.ADMIN_SERVICE_URL || 'http://localhost:7006',
    };

    constructor(private readonly httpService: HttpService) {}

    /**
     * Handle a proxy/axios error uniformly: in production, log the full
     * upstream detail server-side and return a generic message/status to
     * the client (avoids leaking upstream internals); outside production,
     * surface the verbose upstream error to ease debugging.
     */
    private handleProxyError(error: any): never {
        if (error.response) {
            const status = error.response.status;
            if (process.env.NODE_ENV === 'production') {
                this.logger.error(
                    `Proxy upstream error ${status}: ${JSON.stringify(error.response.data)}`
                );
                // Client errors (4xx) carry intentional user-facing messages
                // (validation, business rules, e.g. "Email hoặc mật khẩu không
                // đúng") — pass them through. Server errors (5xx) may leak
                // internal detail/stack, so keep those generic.
                if (status >= 400 && status < 500) {
                    throw new HttpException(error.response.data, status);
                }
                throw new HttpException('Request failed', status);
            }
            throw new HttpException(error.response.data, status);
        }
        this.logger.error(`Proxy error: ${error.message}`);
        throw new HttpException('Service unavailable', 503);
    }

    /**
     * Forward request tới target service
     */
    async forward(
        service: 'auth' | 'exam' | 'finance' | 'admin',
        request: ProxyRequest
    ): Promise<any> {
        const baseUrl = this.serviceUrls[service];
        const url = `${baseUrl}${request.path}`;

        // Debug logging for cookies - log only cookie NAMES, never values
        // (values are session/auth secrets and must not hit application logs).
        if (request.cookies) {
            this.logger.debug(
                `Forwarding cookies: ${Object.keys(request.cookies).join(', ')}`
            );
        }

        const config: AxiosRequestConfig = {
            method: request.method as any,
            url,
            headers: {
                ...request.headers,
                'Content-Type': 'application/json',
                ...(request.cookies && {
                    Cookie: Object.entries(request.cookies)
                        .map(([key, value]) => `${key}=${value}`)
                        .join('; '),
                }),
            },
            params: request.query,
        };

        if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
            config.data = request.body;
        }

        try {
            this.logger.debug(`Forwarding ${request.method} ${url}`);
            const response: AxiosResponse = await firstValueFrom(
                this.httpService.request(config)
            );
            return response.data;
        } catch (error) {
            this.handleProxyError(error);
        }
    }

    /**
     * Forward request nhưng KHÔNG follow redirects - dùng cho OAuth
     * Trả về redirect URL để browser tự redirect
     */
    async forwardWithRedirect(
        service: 'auth' | 'exam' | 'finance' | 'admin',
        request: ProxyRequest
    ): Promise<{ redirectUrl?: string; data?: any; headers?: any }> {
        const baseUrl = this.serviceUrls[service];
        const url = `${baseUrl}${request.path}`;

        const config: AxiosRequestConfig = {
            method: request.method as any,
            url,
            headers: {
                ...request.headers,
                ...(request.cookies && {
                    Cookie: Object.entries(request.cookies)
                        .map(([key, value]) => `${key}=${value}`)
                        .join('; '),
                }),
            },
            params: request.query,
            maxRedirects: 0, // Không follow redirects
            validateStatus: (status) => status >= 200 && status < 400, // Accept 3xx
        };

        try {
            this.logger.debug(`Forwarding OAuth ${request.method} ${url}`);
            const response: AxiosResponse = await firstValueFrom(
                this.httpService.request(config)
            );

            // Nếu là redirect (3xx), trả về redirect URL
            if (response.status >= 300 && response.status < 400) {
                return {
                    redirectUrl: response.headers.location,
                    headers: response.headers
                };
            }

            return {
                data: response.data,
                headers: response.headers
            };
        } catch (error) {
            // Axios throws error on redirect khi maxRedirects: 0
            if (error.response?.status >= 300 && error.response?.status < 400) {
                return {
                    redirectUrl: error.response.headers.location,
                    headers: error.response.headers
                };
            }
            if (error.response) {
                throw new HttpException(
                    error.response.data,
                    error.response.status
                );
            }
            this.logger.error(`Proxy error: ${error.message}`);
            throw new HttpException('Service unavailable', 503);
        }
    }

    /**
     * Forward với JWT token
     */
    async forwardWithAuth(
        service: 'auth' | 'exam' | 'finance' | 'admin',
        request: ProxyRequest,
        token: string
    ): Promise<any> {
        return this.forward(service, {
            ...request,
            headers: {
                ...request.headers,
                Authorization: `Bearer ${token}`,
            },
        });
    }

    /**
     * Forward với JWT token và custom timeout (cho streaming/long-running requests)
     */
    async forwardWithAuthAndTimeout(
        service: 'auth' | 'exam' | 'finance' | 'admin',
        request: ProxyRequest,
        token: string,
        timeoutMs: number
    ): Promise<any> {
        const baseUrl = this.serviceUrls[service];
        const url = `${baseUrl}${request.path}`;

        const config: AxiosRequestConfig = {
            method: request.method as any,
            url,
            headers: {
                ...request.headers,
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            params: request.query,
            timeout: timeoutMs,
        };

        if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
            config.data = request.body;
        }

        try {
            this.logger.debug(
                `Forwarding ${request.method} ${url} (timeout: ${timeoutMs}ms)`
            );
            const response: AxiosResponse = await firstValueFrom(
                this.httpService.request(config)
            );
            return response.data;
        } catch (error) {
            this.handleProxyError(error);
        }
    }

    /**
     * Forward raw request (for multipart/form-data)
     * This bypasses body parsing and forwards the request as-is
     */
    async forwardRaw(
        service: 'auth' | 'exam' | 'finance' | 'admin',
        req: Request,
        path: string
    ): Promise<any> {
        const baseUrl = this.serviceUrls[service];
        const url = `${baseUrl}${path}`;

        // Extract token from request
        const token =
            req.headers.authorization?.replace('Bearer ', '') ||
            req.cookies?.token ||
            req.cookies?.accessToken ||
            '';

        // Forward all headers except host
        const headers = { ...req.headers };
        delete headers.host;
        delete headers['content-length']; // Let axios recalculate

        // Never trust a client-supplied X-Forwarded-For header (it can be
        // spoofed to bypass downstream rate limiting). req.ip is derived by
        // Express from the trusted proxy hop configured in main.ts.
        headers['x-forwarded-for'] = req.ip || req.socket.remoteAddress || '';

        // Add authorization
        if (token) {
            headers.authorization = `Bearer ${token}`;
        }

        const config: AxiosRequestConfig = {
            method: req.method as any,
            url,
            headers,
            params: req.query,
            data: req.body,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        };

        try {
            this.logger.debug(`Forwarding RAW ${req.method} ${url}`);
            const response: AxiosResponse = await firstValueFrom(
                this.httpService.request(config)
            );
            return response.data;
        } catch (error) {
            this.handleProxyError(error);
        }
    }
}
