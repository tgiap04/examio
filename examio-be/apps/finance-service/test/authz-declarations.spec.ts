import 'reflect-metadata';
import { collectControllers, undeclaredHandlers } from '@examio/auth-jwt/testing';
import { FinanceServiceModule } from '../src/finance-service.module';

describe('finance-service authz declarations (deny by default)', () => {
    const controllers = collectControllers(FinanceServiceModule);

    it('finds the feature controllers', () => {
        expect(controllers.length).toBeGreaterThan(3);
    });

    it('every HTTP handler declares @Public / @Authenticated / @RequirePermissions*', () => {
        expect(undeclaredHandlers(controllers)).toEqual([]);
    });
});
