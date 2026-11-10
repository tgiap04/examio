import { DynamicModule, Module, ModuleMetadata, Provider, Type } from '@nestjs/common';
import { createRelayPool, RelayPoolCloser } from '../relay-pool';
import { RELAY_POOL } from '../messaging.constants';
import {
    R2_DELETE_DB,
    R2_DELETE_OPTIONS,
    R2_DELETE_SENDER,
    R2DeleteSender,
    R2DeleteWorkerOptions,
} from './r2-delete.constants';
import { R2DeleteTaskWriter } from './r2-delete-task.writer';
import { R2DeleteWorker } from './r2-delete.worker';

export interface R2DeleteWorkerModuleOptions extends R2DeleteWorkerOptions {
    /** Modules that provide `sender`'s dependencies. */
    imports?: ModuleMetadata['imports'];
    /** Extra providers `sender` depends on (e.g. the service's r2 gRPC client). */
    providers?: Provider[];
    /** Provider class implementing `R2DeleteSender` (the service's r2 gRPC adapter). */
    sender: Type<R2DeleteSender>;
}

/**
 * Worker role: drains `r2_delete_tasks` through its own small pg pool (the
 * service's Prisma pool is never touched). Task *writing* needs no module:
 * list `R2DeleteTaskWriter` as a provider where it is used.
 */
@Module({})
export class R2DeleteWorkerModule {
    static forRoot(options: R2DeleteWorkerModuleOptions): DynamicModule {
        const providers: Provider[] = [
            { provide: R2_DELETE_OPTIONS, useValue: options },
            { provide: RELAY_POOL, useFactory: () => createRelayPool() },
            { provide: R2_DELETE_DB, useExisting: RELAY_POOL },
            ...(options.providers ?? []),
            options.sender,
            { provide: R2_DELETE_SENDER, useExisting: options.sender },
            RelayPoolCloser,
            R2DeleteWorker,
        ];
        return { module: R2DeleteWorkerModule, imports: options.imports ?? [], providers };
    }
}
