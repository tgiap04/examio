import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { adminV1 } from '@kmaedu/contracts';
import { ServiceMetadata } from '@kmaedu/auth-jwt';
import { GrpcClientRegistration, invokeRpc } from '@kmaedu/grpc';
import { PROTO_FILES } from '@kmaedu/contracts';
import { ConfigService } from './config.service';

export const ADMIN_GRPC = 'ADMIN_GRPC';
export const PAGE_FLAGS_BACKOFF = Symbol('PAGE_FLAGS_BACKOFF');

export interface PageFlagsBackoff {
    initialMs: number;
    maxMs: number;
    /** How often a running gateway re-checks that its Redis copy still exists. */
    recheckMs: number;
}

export const DEFAULT_PAGE_FLAGS_BACKOFF: PageFlagsBackoff = {
    initialMs: 1_000,
    maxMs: 30_000,
    recheckMs: 60_000,
};

export const ADMIN_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: ADMIN_GRPC,
    pkg: PROTO_FILES.admin.pkg,
    protoFile: PROTO_FILES.admin.file,
    urlEnv: 'ADMIN_GRPC_URL',
};

const RPC = `${PROTO_FILES.admin.pkg}.${adminV1.ADMIN_SERVICE_NAME}/GetPageFlags`;

/** The pull is wired only when it can work: admin's URL and a service-token source are configured. */
export const pageFlagsPullEnabled = (): boolean =>
    Boolean(
        process.env.ADMIN_GRPC_URL &&
            process.env.AUTH_TOKEN_URL &&
            process.env.SERVICE_CLIENT_SECRET
    );

/**
 * Boot warm-up of the page flags. The gateway has no database: if its Redis
 * copy (`ConfigService`) is empty after a flush/restart it pulls the current
 * flags from admin (`AdminService.GetPageFlags`, service token `aud = admin`)
 * and stores them like `SetPageFlags` does. Admin may not be up yet, so the
 * pull retries with capped exponential backoff in the background; meanwhile
 * the last Redis copy (or default-on, when there is none) keeps being served.
 * A Redis error while checking for the copy retries on the same backoff. Once
 * the flags exist the pull ends, but a slow watcher keeps re-checking so a
 * flush while the gateway runs is healed too. Both stop on shutdown.
 */
@Injectable()
export class PageFlagsBootstrap implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PageFlagsBootstrap.name);
    private admin?: adminV1.AdminServiceClient;
    private stopped = false;
    private wake?: () => void;
    private loop?: Promise<void>;
    private watcher?: Promise<void>;

    constructor(
        private readonly config: ConfigService,
        @Inject(PAGE_FLAGS_BACKOFF) private readonly backoff: PageFlagsBackoff,
        @Optional() @Inject(ADMIN_GRPC) private readonly client?: ClientGrpc,
        @Optional() @Inject(ServiceMetadata) private readonly serviceMetadata?: ServiceMetadata
    ) {}

    onModuleInit(): void {
        if (this.client) {
            this.admin = this.client.getService<adminV1.AdminServiceClient>(adminV1.ADMIN_SERVICE_NAME);
        }
        // Never block (or fail) the gateway's startup on admin.
        this.loop = this.run().catch((err) =>
            this.logger.error(`page-flag pull aborted: ${String(err)}`)
        );
        this.watcher = this.loop.then(() => this.watch());
    }

    /** Resolves when the background pull has finished (applied, disabled or stopped). */
    settled(): Promise<void> {
        return this.loop ?? Promise.resolve();
    }

    async onModuleDestroy(): Promise<void> {
        this.stopped = true;
        this.wake?.();
        await this.loop;
        await this.watcher;
    }

    private async run(): Promise<void> {
        if (!this.admin || !this.serviceMetadata) {
            this.logger.warn('page-flag pull disabled (ADMIN_GRPC_URL / service token not configured)');
            return;
        }
        await this.ensurePages();
    }

    /** Re-checks the Redis copy on a slow interval; only runs when the pull is enabled. */
    private async watch(): Promise<void> {
        if (!this.admin || !this.serviceMetadata) return;
        while (!this.stopped) {
            await this.sleep(this.backoff.recheckMs);
            if (!this.stopped) await this.ensurePages();
        }
    }

    /** Returns once the flags exist in Redis (already there, pulled, or pushed by admin) or on shutdown. */
    private async ensurePages(): Promise<void> {
        let delay = this.backoff.initialMs;
        while (!this.stopped) {
            try {
                if (await this.config.hasPages()) return;
                const metadata = await this.serviceMetadata!.asService('admin');
                const res = await invokeRpc(RPC, (options) =>
                    this.admin!.getPageFlags({}, metadata, options)
                );
                await this.config.setPages({ ...res.flags });
                this.logger.log('page flags pulled from admin');
                return;
            } catch (err) {
                this.logger.warn(`page-flag pull failed, retrying in ${delay}ms: ${String(err)}`);
                await this.sleep(delay);
                delay = Math.min(delay * 2, this.backoff.maxMs);
            }
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, ms);
            this.wake = () => {
                clearTimeout(timer);
                resolve();
            };
        });
    }
}
