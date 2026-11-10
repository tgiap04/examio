import { attemptRelation, type ViewerCapabilities } from './examattempt-access';

const attempt = {
    userId: 'examinee',
    examSession: { examRoom: { hostId: 'host' } },
};
const can = (over: Partial<ViewerCapabilities> = {}): ViewerCapabilities => ({
    canTake: false,
    canViewResults: false,
    canManageSessions: false,
    ...over,
});

describe('attemptRelation', () => {
    it('the examinee needs exam:take', () => {
        expect(
            attemptRelation(attempt, 'examinee', 'read', can({ canTake: true }))
        ).toBe('examinee');
        expect(attemptRelation(attempt, 'examinee', 'read', can())).toBeNull();
    });

    it('the host reads with exam_result:view and writes with exam_session:manage', () => {
        expect(
            attemptRelation(
                attempt,
                'host',
                'read',
                can({ canViewResults: true })
            )
        ).toBe('host');
        expect(
            attemptRelation(
                attempt,
                'host',
                'read',
                can({ canManageSessions: true })
            )
        ).toBeNull();
        expect(
            attemptRelation(
                attempt,
                'host',
                'write',
                can({ canManageSessions: true })
            )
        ).toBe('host');
        expect(
            attemptRelation(
                attempt,
                'host',
                'write',
                can({ canViewResults: true })
            )
        ).toBeNull();
    });

    it('anyone else is nobody, whatever they can do', () => {
        expect(
            attemptRelation(
                attempt,
                'other',
                'read',
                can({
                    canTake: true,
                    canViewResults: true,
                    canManageSessions: true,
                })
            )
        ).toBeNull();
    });
});
