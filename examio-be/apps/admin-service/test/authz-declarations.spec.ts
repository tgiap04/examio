import 'reflect-metadata';
import { collectControllers, undeclaredHandlers } from '@examio/auth-jwt/testing';
import { AdminServiceModule } from '../src/admin-service.module';

describe('admin-service authz declarations (deny by default)', () => {
    const controllers = collectControllers(AdminServiceModule);

    it('finds the feature controllers', () => {
        expect(controllers.length).toBeGreaterThan(5);
    });

    it('every HTTP handler declares @Public / @Authenticated / @RequirePermissions*', () => {
        expect(undeclaredHandlers(controllers)).toEqual([]);
    });
});
