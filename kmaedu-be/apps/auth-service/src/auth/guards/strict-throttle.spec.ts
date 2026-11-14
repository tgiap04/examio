import { Controller, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { HttpThrottlerGuard } from './http-throttler.guard';
import { StrictThrottle } from './strict-throttle.decorator';

@Controller('t')
class ProbeController {
    @Post('strict')
    @StrictThrottle()
    strict() {
        return { ok: true };
    }

    @Post('plain')
    plain() {
        return { ok: true };
    }
}

describe('strict throttle counts exactly once next to the global throttler', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            // Global limit deliberately LOWER than the strict one: if the global guard also
            // counted strict routes, they would be refused at its limit (3), not at 5.
            imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 3 }])],
            controllers: [ProbeController],
            providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });
    afterAll(() => app.close());

    const hit = (path: string) => request(app.getHttpServer()).post(path).then((r) => r.status);

    it('5 strict calls pass and the 6th is 429 (not 3rd, not double counted)', async () => {
        const statuses: number[] = [];
        for (let i = 0; i < 6; i++) statuses.push(await hit('/t/strict'));
        expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    });

    it('a route without the decorator still falls under the global limit', async () => {
        const statuses: number[] = [];
        for (let i = 0; i < 4; i++) statuses.push(await hit('/t/plain'));
        expect(statuses).toEqual([201, 201, 201, 429]);
    });
});
