import 'reflect-metadata';
import { collectControllers, undeclaredHandlers } from '@examio/auth-jwt/testing';
import { AuthServiceModule } from '../src/auth-service.module';

describe('auth-service authz declarations (deny by default)', () => {
    const controllers = collectControllers(AuthServiceModule);

    it('finds the feature controllers', () => {
        expect(controllers.length).toBeGreaterThan(3);
    });

    it('every HTTP handler declares @Public / @Authenticated / @RequirePermissions*', () => {
        expect(undeclaredHandlers(controllers)).toEqual([]);
    });
});
