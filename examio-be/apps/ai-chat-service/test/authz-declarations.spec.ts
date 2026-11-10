import 'reflect-metadata';
import { collectControllers, routeHandlers, undeclaredHandlers } from '@examio/auth-jwt/testing';
import { declarationOf } from '@examio/auth-jwt';
import { AIChatServiceModule } from '../src/ai-chat-service.module';

describe('ai-chat-service authz declarations (deny by default)', () => {
    const controllers = collectControllers(AIChatServiceModule);
    const handlers = controllers.flatMap((c) => routeHandlers(c));

    it('finds the chat and the subject controller, and no gRPC server', () => {
        expect(controllers.map((c) => c.name)).toEqual(expect.arrayContaining(['AIChatController', 'SubjectController']));
        expect(handlers.filter((h) => h.kind === 'rpc')).toEqual([]);
    });

    it('scans the 16 chat routes and the 4 subject routes', () => {
        expect(handlers.filter((h) => h.kind === 'http').length).toBeGreaterThanOrEqual(20);
    });

    it('every HTTP handler declares exactly its authz decorator', () => {
        expect(undeclaredHandlers(controllers)).toEqual([]);
    });

    /** The declaration of a handler: its own, else its class's (the chat controller declares at class level). */
    const declaration = (controller: string, handler: string) => {
        const type = controllers.find((c) => c.name === controller) as new () => object;
        const targets = [type.prototype[handler], type];
        for (const target of targets) {
            const found = declarationOf(<T>(key: string) => Reflect.getMetadata(key, target) as T | undefined);
            if (found) return found;
        }
        return undefined;
    };

    it('no chat route is merely @Authenticated(): each needs ai_chat:use', () => {
        const chat = handlers.filter((h) => h.controller === 'AIChatController');
        expect(chat.length).toBeGreaterThanOrEqual(16);
        const loose = chat.filter((h) => {
            const d = declaration(h.controller, h.handler);
            return d?.kind !== 'permissions' || !d.permissions.includes('ai_chat:use');
        });
        expect(loose.map((h) => h.handler)).toEqual([]);
    });

    it('the subject routes are the only @Public() ones besides the health probes', () => {
        const open = handlers
            .filter((h) => declaration(h.controller, h.handler)?.kind === 'public' && h.controller !== 'HealthController')
            .map((h) => h.controller);
        expect(new Set(open)).toEqual(new Set(['SubjectController']));
        expect(open).toHaveLength(4);
    });
});
