import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { createPrismaAdapter } from './create-prisma-adapter';

@Injectable()
export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy
{
    constructor() {
        super({
            adapter: createPrismaAdapter(),
            // The snapshot (up to 1 MB) is never part of a row anything else reads: lists, includes and
            // the Redis-cached repository rows all skip it. Only SnapshotStore selects it explicitly.
            omit: { examSession: { quizSnapshot: true } },
        });
    }

    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
