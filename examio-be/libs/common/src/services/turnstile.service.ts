import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TurnstileService {
    private readonly logger = new Logger(TurnstileService.name);

    /**
     * Verify Cloudflare Turnstile token
     * @param token Turnstile token from frontend
     */
    async verify(token: string): Promise<boolean> {
        // Production-only verification.
        //
        // Rationale: in development / staging the frontend may run on
        // localhost or an unregistered host, the site key is usually the
        // production one, and the resulting `success: false` would block
        // real users. We only require Turnstile when running in
        // production. To force-enable verification in non-production
        // (e.g. for an end-to-end smoke test), set TURNSTILE_ENFORCE=1.
        if (
            process.env.NODE_ENV !== 'production' &&
            process.env.TURNSTILE_ENFORCE !== '1'
        ) {
            this.logger.warn(
                `Skipping Turnstile verification (NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}).`
            );
            return true;
        }

        const secretKey = process.env.TURNSTILE_SECRET_KEY;
        if (!secretKey) {
            this.logger.error(
                'TURNSTILE_SECRET_KEY is required in production. Rejecting request.'
            );
            throw new BadRequestException('Xác thực bảo mật thất bại');
        }

        if (!token) {
            throw new BadRequestException('Turnstile token is required');
        }

        try {
            const params = new URLSearchParams();
            params.append('secret', secretKey);
            params.append('response', token);

            const response = await axios.post(
                'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                params,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const data = response.data;

            if (!data.success) {
                this.logger.error(
                    `Turnstile verification failed: ${JSON.stringify(data)}`
                );
                throw new BadRequestException('Xác thực bảo mật thất bại');
            }

            return true;
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`Error verifying Turnstile: ${error.message}`);
            throw new BadRequestException('Lỗi khi xác thực bảo mật');
        }
    }
}
