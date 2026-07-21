import { StudyRoomPlaylistService } from './study-room-playlist.service';
import { PlaylistItemKind } from './study-room.constants';

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

describe('StudyRoomPlaylistService.remove — index-shift logic', () => {
    it('xoá item trước current → currentIndex dịch giảm', async () => {
        const { service, repo, state } = make();
        const playlist = items(4); // [0, 1, 2, 3]
        repo.listPlaylist
            .mockResolvedValueOnce(playlist) // before
            .mockResolvedValueOnce(playlist); // after remove
        state.getCurrentIndex.mockResolvedValue(2);
        // Xoá item TRƯỚC item đang phát → item đang phát vẫn phát, chỉ dịch index 2→1;
        // KHÔNG restart media (tránh giật/seek vô cớ).
        const res = await service.remove('r1', 'i1');
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 1);
        expect(res.media).toBeUndefined();
        expect(res.state.currentIndex).toBe(1);
    });

    it('xoá đúng item đang phát → phát item thế chỗ (không lùi về trước)', async () => {
        const { service, repo, state } = make();
        const playlist = items(4);
        repo.listPlaylist
            .mockResolvedValueOnce(playlist)
            .mockResolvedValueOnce(playlist);
        state.getCurrentIndex.mockResolvedValue(1);
        // Xoá item đang phát (index 1) → item kế dồn vào slot 1 → phát nó (restart media).
        const res = await service.remove('r1', 'i1');
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 1);
        expect(res.media).toBeDefined();
    });

    it('xoá item sau current → currentIndex không đổi', async () => {
        const { service, repo, state } = make();
        const playlist = items(4);
        repo.listPlaylist
            .mockResolvedValueOnce(playlist)
            .mockResolvedValueOnce(playlist);
        state.getCurrentIndex.mockResolvedValue(1);
        // Xoá item 3 (sau item 1) → current giữ nguyên 1
        const res = await service.remove('r1', 'i3');
        expect(state.setCurrentIndex).not.toHaveBeenCalled();
        expect(res.media).toBeUndefined();
    });

    it('xoá item không tìm thấy → không thay đổi index', async () => {
        const { service, repo, state } = make();
        const playlist = items(3);
        repo.listPlaylist
            .mockResolvedValueOnce(playlist)
            .mockResolvedValueOnce(playlist);
        state.getCurrentIndex.mockResolvedValue(1);
        const res = await service.remove('r1', 'nonexistent');
        expect(state.setCurrentIndex).not.toHaveBeenCalled();
        expect(res.media).toBeUndefined();
    });

    it('xoá từ đầu playlist (index 0) → currentIndex clamp về 0', async () => {
        const { service, repo, state } = make();
        const playlist = items(3);
        repo.listPlaylist
            .mockResolvedValueOnce(playlist)
            .mockResolvedValueOnce(playlist);
        state.getCurrentIndex.mockResolvedValue(0);
        const res = await service.remove('r1', 'i0');
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 0); // clamp vào biên
        expect(res.media).toBeDefined();
    });
});

describe('StudyRoomPlaylistService.reorder', () => {
    it('sắp xếp lại playlist', async () => {
        const { service, repo } = make();
        const reordered = items(3).map((i) => ({ ...i }));
        repo.listPlaylist.mockResolvedValue(reordered);
        const newOrder = ['i2', 'i0', 'i1'];
        const result = await service.reorder('r1', newOrder);
        expect(repo.reorderPlaylist).toHaveBeenCalledWith('r1', newOrder);
        expect(result.items).toHaveLength(3);
    });

    it('reorder gọi repo với đúng order', async () => {
        const { service, repo } = make();
        repo.listPlaylist.mockResolvedValue([]);
        await service.reorder('r1', []);
        expect(repo.reorderPlaylist).toHaveBeenCalledWith('r1', []);
    });

    it('reorder kéo con trỏ theo đúng bài đang phát', async () => {
        const { service, repo, state } = make();
        state.getCurrentIndex.mockResolvedValue(1); // đang phát i1
        const original = items(3); // i0,i1,i2
        const reordered = [
            { ...original[1], order: 0 }, // i1 lên đầu
            { ...original[2], order: 1 }, // i2
            { ...original[0], order: 2 }, // i0
        ];
        repo.listPlaylist
            .mockResolvedValueOnce(original) // getState "before"
            .mockResolvedValueOnce(reordered); // getState "after"
        const result = await service.reorder('r1', ['i1', 'i2', 'i0']);
        // i1 giờ ở index 0 → con trỏ phải theo bài đó, không giữ nguyên số 1.
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 0);
        expect(result.currentIndex).toBe(0);
    });
});

describe('StudyRoomPlaylistService.jump', () => {
    it('jump tới index hợp lệ', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(4));
        const res = await service.jump('r1', 2);
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 2);
        expect(res.state.currentIndex).toBe(2);
        expect(res.media).toBeDefined();
    });

    it('jump tới index âm → clamp về 0', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(3));
        const res = await service.jump('r1', -5);
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 0);
        expect(res.state.currentIndex).toBe(0);
    });

    it('jump vượt danh sách → clamp về cuối', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(3));
        const res = await service.jump('r1', 100);
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 2); // max index = len-1
        expect(res.state.currentIndex).toBe(2);
    });

    it('jump trong playlist trống → clamp về 0', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue([]);
        const res = await service.jump('r1', 0);
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 0);
        expect(res.state.currentIndex).toBe(0);
        expect(res.media?.url).toBeNull();
    });
});

describe('StudyRoomPlaylistService.add — kind detection', () => {
    it('phát hiện VIDEO từ URL watch', async () => {
        const { service, repo } = make();
        repo.listPlaylist.mockResolvedValue([]);
        await service.add('r1', 'https://youtube.com/watch?v=dQw4w9WgXcQ', 'u1');
        const call = repo.addPlaylistItem.mock.calls[0][0];
        expect(call.kind).toBe(PlaylistItemKind.VIDEO);
    });

    it('phát hiện VIDEO từ youtu.be', async () => {
        const { service, repo } = make();
        repo.listPlaylist.mockResolvedValue([]);
        await service.add('r1', 'https://youtu.be/dQw4w9WgXcQ', 'u1');
        const call = repo.addPlaylistItem.mock.calls[0][0];
        expect(call.kind).toBe(PlaylistItemKind.VIDEO);
    });

    it('phát hiện PLAYLIST từ YouTube playlist URL', async () => {
        const { service, repo } = make();
        repo.listPlaylist.mockResolvedValue([]);
        await service.add('r1', 'https://youtube.com/playlist?list=PL123456', 'u1');
        const call = repo.addPlaylistItem.mock.calls[0][0];
        expect(call.kind).toBe(PlaylistItemKind.PLAYLIST);
    });

    it('phát hiện VIDEO khi có list= cùng v= (list bị ignore)', async () => {
        const { service, repo } = make();
        repo.listPlaylist.mockResolvedValue([]);
        await service.add(
            'r1',
            'https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123456',
            'u1'
        );
        const call = repo.addPlaylistItem.mock.calls[0][0];
        expect(call.kind).toBe(PlaylistItemKind.VIDEO); // v= có → VIDEO
    });

    it('trim URL trước lưu', async () => {
        const { service, repo } = make();
        repo.listPlaylist.mockResolvedValue([]);
        await service.add('r1', '  https://youtu.be/dQw4w9WgXcQ  ', 'u1');
        const call = repo.addPlaylistItem.mock.calls[0][0];
        expect(call.url).toBe('https://youtu.be/dQw4w9WgXcQ');
    });
});

describe('StudyRoomPlaylistService.step — boundary clamping', () => {
    it('next từ cuối playlist → clamp về cuối', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(3));
        state.getCurrentIndex.mockResolvedValue(2);
        const res = await service.step('r1', 1);
        expect(res.state.currentIndex).toBe(2); // clamp, không overflow
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 2);
    });

    it('prev từ đầu playlist → clamp về đầu', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(3));
        state.getCurrentIndex.mockResolvedValue(0);
        const res = await service.step('r1', -1);
        expect(res.state.currentIndex).toBe(0);
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 0);
    });

    it('step +2 từ giữa → dịch 2 bước', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(5));
        state.getCurrentIndex.mockResolvedValue(1);
        const res = await service.step('r1', 2);
        expect(res.state.currentIndex).toBe(3);
        expect(state.setCurrentIndex).toHaveBeenCalledWith('r1', 3);
    });
});

describe('StudyRoomPlaylistService.getState — currentIndex clamping', () => {
    it('currentIndex vượt danh sách → clamp về cuối', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(2));
        state.getCurrentIndex.mockResolvedValue(10);
        const s = await service.getState('r1');
        expect(s.currentIndex).toBe(1);
    });

    it('playlist rỗng → currentIndex = 0', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue([]);
        state.getCurrentIndex.mockResolvedValue(0);
        const s = await service.getState('r1');
        expect(s.currentIndex).toBe(0);
        expect(s.items).toHaveLength(0);
    });

    it('leader được tính toán', async () => {
        const { service, repo, state } = make();
        repo.listMembersLite.mockResolvedValue([
            { userId: 'u1', role: 2, joinedAt: new Date(1) },
        ]);
        state.getPresenceMap.mockResolvedValue({ u1: 'studying' });
        repo.listPlaylist.mockResolvedValue(items(1));
        const s = await service.getState('r1');
        expect(s.leaderUserId).toBe('u1');
    });
});

describe('StudyRoomPlaylistService.advanceOnEnded — edge cases', () => {
    it('advance tại cuối danh sách 1 phần tử → dừng (null)', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(1));
        state.getCurrentIndex.mockResolvedValue(0);
        const res = await service.advanceOnEnded('r1', 0);
        expect(res).toBeNull();
    });

    it('advance tại item cuối-1 → sang item cuối', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue(items(3));
        state.getCurrentIndex.mockResolvedValue(1);
        const res = await service.advanceOnEnded('r1', 1);
        expect(res).not.toBeNull();
        expect(res!.state.currentIndex).toBe(2);
    });

    it('advance từ playlist rỗng → dừng', async () => {
        const { service, repo, state } = make();
        repo.listPlaylist.mockResolvedValue([]);
        state.getCurrentIndex.mockResolvedValue(0);
        const res = await service.advanceOnEnded('r1', 0);
        expect(res).toBeNull();
    });
});
