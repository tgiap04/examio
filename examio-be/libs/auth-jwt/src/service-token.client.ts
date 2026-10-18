import { Logger } from '@nestjs/common';

export interface IssuedServiceToken {
    token: string;
    /** Epoch ms. */
    expiresAt: number;
}

/** Where a service token comes from: auth over HTTP, or auth signing locally. */
export interface ServiceTokenSource {
    fetch(audience: string): Promise<IssuedServiceToken>;
}

const REFRESH_MARGIN_MS = 60_000;
const ATTEMPTS = 3;
const BASE_BACKOFF_MS = 200;

const realSleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One cached service token per audience, refreshed `exp - 60 s`, with a
 * single in-flight fetch per audience. A failed refresh falls back to the
 * still-valid cached token, so a short auth outage (<= the 60 s margin)
 * does not stop service-to-service calls.
 */
export class ServiceTokenClient {
    private readonly logger = new Logger(ServiceTokenClient.name);
    private readonly cache = new Map<string, IssuedServiceToken>();
    private readonly inflight = new Map<string, Promise<IssuedServiceToken>>();

    constructor(
        private readonly source: ServiceTokenSource,
        private readonly now: () => number = Date.now,
        private readonly sleep: (ms: number) => Promise<void> = realSleep
    ) {}

    async getToken(audience: string): Promise<string> {
        const cached = this.cache.get(audience);
        if (cached && this.now() < cached.expiresAt - REFRESH_MARGIN_MS) {
            return cached.token;
        }
        try {
            return (await this.refresh(audience)).token;
        } catch (err) {
            if (cached && this.now() < cached.expiresAt) {
                this.logger.warn(
                    `Service token refresh for "${audience}" failed; using the cached token`
                );
                return cached.token;
            }
            throw err;
        }
    }

    private refresh(audience: string): Promise<IssuedServiceToken> {
        const existing = this.inflight.get(audience);
        if (existing) return existing;
        const pending = this.fetchWithRetry(audience)
            .then((issued) => {
                this.cache.set(audience, issued);
                return issued;
            })
            .finally(() => this.inflight.delete(audience));
        this.inflight.set(audience, pending);
        return pending;
    }

    private async fetchWithRetry(audience: string): Promise<IssuedServiceToken> {
        let lastError: unknown;
        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
            try {
                return await this.source.fetch(audience);
            } catch (err) {
                lastError = err;
                if (attempt < ATTEMPTS - 1) {
                    await this.sleep(BASE_BACKOFF_MS * 2 ** attempt);
                }
            }
        }
        throw lastError;
    }
}

export interface HttpServiceTokenSourceOptions {
    tokenUrl: string;
    serviceName: string;
    clientSecret: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}

/** `POST /internal/token` (client_credentials) against auth. */
export class HttpServiceTokenSource implements ServiceTokenSource {
    constructor(private readonly options: HttpServiceTokenSourceOptions) {}

    async fetch(audience: string): Promise<IssuedServiceToken> {
        const doFetch = this.options.fetchImpl ?? fetch;
        const response = await doFetch(this.options.tokenUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                client_id: this.options.serviceName,
                client_secret: this.options.clientSecret,
                audience,
            }),
            signal: AbortSignal.timeout(this.options.timeoutMs ?? 3000),
        });
        if (!response.ok) {
            throw new Error(
                `Service token request for "${audience}" failed with HTTP ${response.status}`
            );
        }
        const body = (await response.json()) as {
            access_token?: unknown;
            expires_in?: unknown;
        };
        if (
            typeof body.access_token !== 'string' ||
            typeof body.expires_in !== 'number'
        ) {
            throw new Error('Service token response is malformed');
        }
        return {
            token: body.access_token,
            expiresAt: Date.now() + body.expires_in * 1000,
        };
    }
}
