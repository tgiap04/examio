import 'reflect-metadata';
import { collectControllers, undeclaredHandlers } from '@kmaedu/auth-jwt/testing';
import { StudyRoomServiceModule } from '../src/study-room-service.module';

describe('study-room-service authz declarations (deny by default)', () => {
    const controllers = collectControllers(StudyRoomServiceModule);

    it('finds the study-room controller', () => {
        expect(controllers.map((c) => c.name)).toContain('StudyRoomController');
    });

    it('every HTTP handler declares @Public / @Authenticated / @RequirePermissions*', () => {
        expect(undeclaredHandlers(controllers)).toEqual([]);
    });
});
