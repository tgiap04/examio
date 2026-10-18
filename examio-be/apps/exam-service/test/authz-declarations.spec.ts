import 'reflect-metadata';
import { collectControllers, undeclaredHandlers } from '@examio/auth-jwt/testing';
import { ExamServiceModule } from '../src/exam-service.module';

describe('exam-service authz declarations (deny by default)', () => {
    const controllers = collectControllers(ExamServiceModule);

    it('finds the feature controllers', () => {
        expect(controllers.length).toBeGreaterThan(10);
    });

    it('every HTTP handler declares @Public / @Authenticated / @RequirePermissions*', () => {
        expect(undeclaredHandlers(controllers)).toEqual([]);
    });
});
