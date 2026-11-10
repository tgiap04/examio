import 'reflect-metadata';
import { collectControllers, undeclaredHandlers } from '@kmaedu/auth-jwt/testing';
import { AssessmentServiceModule } from '../src/assessment-service.module';

describe('assessment-service authz declarations (deny by default)', () => {
    const controllers = collectControllers(AssessmentServiceModule);

    it('finds the feature controllers', () => {
        expect(controllers.length).toBeGreaterThanOrEqual(5); // room, session, attempt, cheating log, student (exam half)
    });

    it('every HTTP handler declares @Public / @Authenticated / @RequirePermissions*', () => {
        expect(undeclaredHandlers(controllers)).toEqual([]);
    });
});
