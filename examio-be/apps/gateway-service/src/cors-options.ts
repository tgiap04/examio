import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3001', 'http://127.0.0.1:5173'];

/**
 * Allowlist from `CORS_ORIGINS` (comma list) or `FRONTEND_URL`, plus the local
 * dev origins outside production. Production without any configured origin is
 * a boot error, not a silent open door.
 */
export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
    const configured = (env.CORS_ORIGINS || env.FRONTEND_URL || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    const production = env.NODE_ENV === 'production';
    const origin = production ? configured : [...configured, ...DEV_ORIGINS];

    if (production && origin.length === 0) {
        throw new Error('CORS_ORIGINS or FRONTEND_URL must be configured in production');
    }
    return {
        origin,
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With', 'X-Device-ID'],
    };
}
