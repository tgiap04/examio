import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TurnstileService {
    private readonly logger = new Logger(TurnstileService.name);
    private readonly secretKey = process.env.TURNSTILE_SECRET_KEY;

    /**
     * Verify Cloudflare Turnstile token
     * @param token Turnstile token from frontend
     */
    async verify(token: string): Promise<boolean> {
        if (!this.secretKey) {
            this.logger.warn(
                'TURNSTILE_SECRET_KEY not configured. Skipping verification.'
            );
            return true;
        }

        if (!token) {
            throw new BadRequestException('Turnstile token is required');
        }

        try {
            const params = new URLSearchParams();
            params.append('secret', this.secretKey);
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
