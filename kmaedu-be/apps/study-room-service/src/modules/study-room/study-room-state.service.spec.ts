import { StudyRoomStateService } from './study-room-state.service';
import { PomodoroConfig } from './study-room-pomodoro';

const cfg: PomodoroConfig = {
    workMinutes: 30,
    breakMinutes: 5,
    longBreakMinutes: 15,
    cyclesBeforeLongBreak: 4,
};

function make() {
    const store: Record<string, string> = {};
    const client: any = {
        get: jest.fn(async (k: string) => store[k] ?? null),
        set: jest.fn(async (k: string, v: string, ..._rest: any[]) => {
            // set NX (chat rate limit) — arg cuối là 'NX'
            if (_rest[_rest.length - 1] === 'NX' && store[k] != null) return null;
            store[k] = v;
            return 'OK';
        }),
        del: jest.fn(async (k: string) => {
            delete store[k];
        }),
        getdel: jest.fn(async (k: string) => {
            const v = store[k] ?? null;
            delete store[k];
            return v;
        }),
        srem: jest.fn(async () => 1),
        sadd: jest.fn(async () => 1),
        expire: jest.fn(async () => 1),
        smembers: jest.fn(async () => [] as string[]),
        mget: jest.fn(async (...keys: string[]) =>
            keys.map((k) => store[k] ?? null)
        ),
    };
    // multi() chainable: áp dụng set vào store để test presence/timer nếu cần.
    const makeChain = () => {
        const chain: any = {};
        const ops: Array<() => void> = [];
        for (const m of [
            'set',
            'del',
            'sadd',
            'srem',
            'expire',
            'incrby',
            'lpush',
            'ltrim',
        ]) {
            chain[m] = (...args: any[]) => {
                if (m === 'set') ops.push(() => (store[args[0]] = args[1]));
                if (m === 'del') ops.push(() => delete store[args[0]]);
                return chain;
            };
        }
        chain.exec = async () => {
            ops.forEach((f) => f());
            return [];
        };
        return chain;
    };
    client.multi = jest.fn(() => makeChain());
    const redis: any = { getClient: () => client };
    return { service: new StudyRoomStateService(redis), store, client };
}

describe('StudyRoomStateService — timer', () => {
    it('startTimer từ trạng thái trống → chạy pha work', async () => {
        const { service } = make();
        const t = await service.startTimer('r1', cfg);
        expect(t.running).toBe(true);
        expect(t.phase).toBe('work');
        expect(t.cycle).toBe(1);
    });

    it('pauseTimer lưu pausedRemainingMs, resume tiếp tục', async () => {
        const { service } = make();
        await service.startTimer('r1', cfg);
        const paused = await service.pauseTimer('r1', cfg);
        expect(paused.running).toBe(false);
        expect(paused.pausedRemainingMs).toBeGreaterThan(0);
        expect(paused.pausedRemainingMs).toBeLessThanOrEqual(30 * 60_000);

        const resumed = await service.startTimer('r1', cfg);
        expect(resumed.running).toBe(true);
        expect(resumed.phase).toBe('work');
    });

    it('resetTimer về đầu pha work, dừng', async () => {
        const { service } = make();
        await service.startTimer('r1', cfg);
        const r = await service.resetTimer('r1');
        expect(r.running).toBe(false);
        expect(r.phase).toBe('work');
        expect(r.cycle).toBe(1);
    });
});

describe('StudyRoomStateService — chat rate limit', () => {
    it('cho phép lần đầu, chặn lần thứ hai trong 1s', async () => {
        const { service } = make();
        expect(await service.allowChat('r1', 'u1')).toBe(true);
        expect(await service.allowChat('r1', 'u1')).toBe(false);
    });
});

describe('StudyRoomStateService — control rate limit', () => {
    it('chặn lệnh điều khiển spam trong cửa sổ', async () => {
        const { service } = make();
        expect(await service.allowControl('r1', 'u1')).toBe(true);
        expect(await service.allowControl('r1', 'u1')).toBe(false);
    });
});

describe('StudyRoomStateService — presence (set-based, không SCAN)', () => {
    it('getPresenceMap đọc từ presence-set + MGET, dọn entry hết TTL', async () => {
        const { service, store, client } = make();
        client.smembers.mockResolvedValue(['u1', 'u2']);
        store['studyroom:r1:presence:u1'] = 'studying';
        // u2 hết TTL → không có key
        const map = await service.getPresenceMap('r1');
        expect(map).toEqual({ u1: 'studying' });
        expect(client.srem).toHaveBeenCalledWith(
            'studyroom:r1:presence-set',
            'u2'
        );
    });
});

describe('StudyRoomStateService — focus', () => {
    it('takeFocus đọc & xoá giá trị', async () => {
        const { service, store, client } = make();
        store['studyroom:r1:focus:u1'] = '90';
        const val = await service.takeFocus('r1', 'u1');
        expect(val).toBe(90);
        expect(client.getdel).toHaveBeenCalledWith('studyroom:r1:focus:u1');
    });
    it('takeFocus trả 0 khi không có', async () => {
        const { service } = make();
        expect(await service.takeFocus('r1', 'u2')).toBe(0);
    });
});

describe('StudyRoomStateService — media', () => {
    it('setMedia khởi tạo, seekMedia cập nhật vị trí', async () => {
        const { service } = make();
        const set = await service.setMedia('r1', 'https://youtu.be/abc');
        expect(set.url).toBe('https://youtu.be/abc');
        expect(set.playing).toBe(false);
        const seek = await service.seekMedia('r1', 42);
        expect(seek.positionSec).toBe(42);
    });
});
