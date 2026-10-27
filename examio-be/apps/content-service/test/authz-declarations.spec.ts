import 'reflect-metadata';
import { collectControllers, undeclaredHandlers } from '@examio/auth-jwt/testing';
import { ContentServiceModule } from '../src/content-service.module';

describe('content-service authz declarations (deny by default)', () => {
    const controllers = collectControllers(ContentServiceModule);

    it('finds the feature controllers', () => {
        expect(controllers.length).toBeGreaterThanOrEqual(10);
    });

    it('every HTTP handler declares @Public / @Authenticated / @RequirePermissions*', () => {
        expect(undeclaredHandlers(controllers)).toEqual([]);
    });
});
