import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type {
    AiWordFamilyRequest,
    AiWordFamilyResponse,
} from '../modules/word-family/interfaces/word-family.interface';

/** The model call can take minutes; the caller is a background job or a long poll. */
const GENERATION_TIMEOUT_MS = 600_000;

/**
 * HTTP client of ai-service `/generate/word-family`, authenticated with
 * `x-internal-service-token`. Temporary: phase 13 replaces it with a gRPC call
 * under service identity, and `INTERNAL_SERVICE_TOKEN` leaves this service's env.
 */
@Injectable()
export class AiClient {
    private readonly baseUrl: string;

    constructor(private readonly http: HttpService) {
        this.baseUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000/api';
    }

    async generateWordFamily(
        payload: AiWordFamilyRequest
    ): Promise<AiWordFamilyResponse | undefined> {
        const response = await firstValueFrom(
            this.http.post<AiWordFamilyResponse>(
                `${this.baseUrl}/generate/word-family`,
                payload,
                {
                    timeout: GENERATION_TIMEOUT_MS,
                    headers: {
                        'x-internal-service-token':
                            process.env.INTERNAL_SERVICE_TOKEN || '',
                    },
                }
            )
        );
        return response.data;
    }
}
