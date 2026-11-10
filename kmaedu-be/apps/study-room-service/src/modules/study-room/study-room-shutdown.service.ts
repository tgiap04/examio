import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { StudyRoomGateway } from './study-room.gateway';

/**
 * SIGTERM drain (`app.enableShutdownHooks()` in main.ts). Nest destroys this
 * module before PrismaModule / RedisModule, so the focus time still buffered in
 * Redis can be written to the database before either connection closes.
 * Sockets are then closed by the HTTP server shutdown; clients reconnect on
 * their own to the next instance.
 */
@Injectable()
export class StudyRoomShutdown implements OnModuleDestroy {
    private readonly logger = new Logger(StudyRoomShutdown.name);

    constructor(private readonly gateway: StudyRoomGateway) {}

    async onModuleDestroy(): Promise<void> {
        this.logger.log('Draining study-room focus time before shutdown');
        await this.gateway.drainFocus();
    }
}
