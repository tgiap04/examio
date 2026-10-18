import 'reflect-metadata';
import { collectControllers, undeclaredHandlers } from '@examio/auth-jwt/testing';
import { R2ServiceModule } from '../src/r2-service.module';

describe('r2-service authz declarations (deny by default)', () => {
    const controllers = collectControllers(R2ServiceModule);

    it('finds the feature controllers', () => {
        expect(controllers.length).toBeGreaterThan(0);
    });

    it('every HTTP handler declares @Public / @Authenticated / @RequirePermissions*', () => {
        expect(undeclaredHandlers(controllers)).toEqual([]);
    });
});
