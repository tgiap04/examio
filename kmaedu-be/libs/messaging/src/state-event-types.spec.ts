import { stateVersionField } from './state-event-types';

describe('stateVersionField', () => {
    it('treats the authz event as a state event versioned by authzVersion', () => {
        expect(stateVersionField('auth.user.authz_changed')).toBe('authzVersion');
    });

    it('treats *.updated, *.changed and *.<word>_changed as state events', () => {
        expect(stateVersionField('exam.room.updated')).toBe('version');
        expect(stateVersionField('finance.wallet.changed')).toBe('version');
        expect(stateVersionField('auth.user.role_changed')).toBe('version');
        expect(stateVersionField('auth.user.profile_data_changed')).toBe('version');
    });

    it('treats facts as non-state', () => {
        expect(stateVersionField('auth.user.registered')).toBeNull();
        expect(stateVersionField('exam.room.created')).toBeNull();
        expect(stateVersionField('exam.room.unchanged')).toBeNull();
        expect(stateVersionField('exam.updated.registered')).toBeNull();
    });
});
