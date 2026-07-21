import { StudyRoomPlaylistService } from './study-room-playlist.service';

function make() {
    let currentIndex = 0;
    const repo: any = {
        listMembersLite: jest.fn().mockResolvedValue([]),
        listPlaylist: jest.fn().mockResolvedValue([]),
        addPlaylistItem: jest.fn().mockResolvedValue({}),
        removePlaylistItem: jest.fn().mockResolvedValue(undefined),
        reorderPlaylist: jest.fn().mockResolvedValue(undefined),
        setCurrentMedia: jest.fn().mockResolvedValue(undefined),
    };
    const state: any = {
        getPresenceMap: jest.fn().mockResolvedValue({}),
        getCurrentIndex: jest.fn(async () => currentIndex),
        setCurrentIndex: jest.fn(async (_r: string, i: number) => {
            currentIndex = i;
        }),
        playItem: jest.fn(async (_r: string, url: string | null) => ({
            url,
            playing: !!url,
            positionSec: 0,
            updatedAt: 0,
        })),
    };
    const service = new StudyRoomPlaylistService(repo, state);
    return { service, repo, state };
}

const items = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: `i${i}`,
        url: `https://youtu.be/vid${i}0000000`,
        kind: 0,
        title: null,
        addedByUserId: 'u1',
        order: i,
    }));

describe('StudyRoomPlaylistService.computeLeader', () => {
    it('host online được ưu tiên làm leader', async () => {
        const { service, repo, state } = make();
        repo.listMembersLite.mockResolvedValue([
            { userId: 'm1', role: 0, joinedAt: new Date(1) },
            { userId: 'host', role: 2, joinedAt: new Date(2) },
        ]);
        state.getPresenceMap.mockResolvedValue({ m1: 'studying', host: 'break' });
        expect(await service.computeLeader('r1')).toBe('host');
    });

    it('không host online → member online vào sớm nhất', async () => {
        const { service, repo, state } = make();
        repo.listMembersLite.mockResolvedValue([
            { userId: 'm1', role: 0, joinedAt: new Date(1) },
            { userId: 'm2', role: 0, joinedAt: new Date(2) },
        ]);
        state.getPresenceMap.mockResolvedValue({ m2: 'studying', m1: 'break' });
        expect(await service.computeLeader('r1')).toBe('m1'); // sớm hơn
    });

    it('không ai online → null', async () => {
        const { service, repo } = make();
        repo.listMembersLite.mockResolvedValue([
            { userId: 'm1', role: 0, joinedAt: new Date(1) },
        ]);
        expect(await service.computeLeader('r1')).toBeNull();
    });
});

describe('StudyRoomPlaylistService.getState', () => {
    it('kẹp currentIndex khi vượt số item', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(2));
        state.getCurrentIndex.mockResolvedValue(5);
        const s = await service.getState('r1');
        expect(s.currentIndex).toBe(1); // len-1
        expect(s.items).toHaveLength(2);
    });
});

describe('StudyRoomPlaylistService.advanceOnEnded (leader auto-advance)', () => {
    it('endedIndex lệch currentIndex → không advance', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(3));
        state.getCurrentIndex.mockResolvedValue(0);
        expect(await service.advanceOnEnded('r1', 2)).toBeNull();
    });

    it('đang ở cuối playlist → dừng (null)', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(2));
        state.getCurrentIndex.mockResolvedValue(1);
        expect(await service.advanceOnEnded('r1', 1)).toBeNull();
    });

    it('giữa playlist + index khớp → sang item kế', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(3));
        state.getCurrentIndex.mockResolvedValue(0);
        const res = await service.advanceOnEnded('r1', 0);
        expect(res).not.toBeNull();
        expect(res!.state.currentIndex).toBe(1);
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 1);
        expect(res!.media?.url).toContain('vid1');
    });
});

describe('StudyRoomPlaylistService.step', () => {
    it('prev tại đầu playlist → kẹp về 0', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(3));
        state.getCurrentIndex.mockResolvedValue(0);
        const res = await service.step('r1', -1);
        expect(res.state.currentIndex).toBe(0);
    });

    it('next dịch sang item kế', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(3));
        state.getCurrentIndex.mockResolvedValue(1);
        const res = await service.step('r1', 1);
        expect(res.state.currentIndex).toBe(2);
    });
});
