import { PermanentEventError, type Envelope } from '@examio/messaging';
import {
    StudyRoomAuthzHandler,
    AUTHZ_CHANGED,
} from './study-room-authz.handler';
import type { StudyRoomBroadcaster } from './study-room-broadcaster.service';

const envelope = (data: unknown): Envelope =>
    ({ type: AUTHZ_CHANGED, data }) as unknown as Envelope;

describe('StudyRoomAuthzHandler', () => {
    const reauth = jest.fn().mockResolvedValue(1);
    const handler = new StudyRoomAuthzHandler({
        reauthStaleSockets: reauth,
    } as unknown as StudyRoomBroadcaster);

    beforeEach(() => reauth.mockClear());

    it('re-authenticates the stale sockets of the user in the event', async () => {
        await handler.onAuthzChanged(
            envelope({ userId: 'u1', authzVersion: 4, role: 'TEACHER' })
        );
        expect(reauth).toHaveBeenCalledWith('u1', 4);
    });

    it('rejects a malformed payload as permanent (dead-letter, no retry)', async () => {
        await expect(
            handler.onAuthzChanged(envelope({ userId: '', authzVersion: 1 }))
        ).rejects.toBeInstanceOf(PermanentEventError);
        await expect(
            handler.onAuthzChanged(envelope({ userId: 'u1' }))
        ).rejects.toBeInstanceOf(PermanentEventError);
        expect(reauth).not.toHaveBeenCalled();
    });

    it('lets a broadcaster failure propagate so the consumer retries', async () => {
        reauth.mockRejectedValueOnce(new Error('redis adapter timeout'));
        await expect(
            handler.onAuthzChanged(envelope({ userId: 'u1', authzVersion: 1 }))
        ).rejects.toThrow('redis adapter timeout');
    });
});
