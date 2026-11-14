import { Injectable } from '@nestjs/common';
import { RedisService } from '@kmaedu/redis';
import {
    StudyRoomKeys,
    STUDY_ROOM_LIVE_TTL,
    PRESENCE_TTL,
    CHAT_HISTORY_MAX,
    FOCUS_CREDIT_WINDOW,
} from './study-room.constants';
import { TimerState, MediaState, ChatMessage } from './study-room.events';
import {
    PomodoroConfig,
    normalizeTimer,
    phaseDurationMs,
    freshTimer,
} from './study-room-pomodoro';

// Toàn bộ state runtime của phòng sống ở Redis (không đụng DB).
@Injectable()
export class StudyRoomStateService {
    constructor(private readonly redis: RedisService) {}

    private get client() {
        return this.redis.getClient();
    }

    // ---- Timer ---------------------------------------------------------------
    async getTimer(roomId: string, cfg: PomodoroConfig): Promise<TimerState> {
        const raw = await this.client.get(StudyRoomKeys.timer(roomId));
        if (!raw) return freshTimer(Date.now(), false);
        return normalizeTimer(JSON.parse(raw) as TimerState, cfg, Date.now());
    }

    private async saveTimer(roomId: string, timer: TimerState): Promise<void> {
        await this.client.set(
            StudyRoomKeys.timer(roomId),
            JSON.stringify(timer),
            'EX',
            STUDY_ROOM_LIVE_TTL
        );
    }

    async startTimer(roomId: string, cfg: PomodoroConfig): Promise<TimerState> {
        const current = await this.getTimer(roomId, cfg);
        if (current.running) return current;

        const now = Date.now();
        let next: TimerState;
        if (current.pausedRemainingMs != null) {
            const dur = phaseDurationMs(current.phase, cfg);
            next = {
                phase: current.phase,
                cycle: current.cycle,
                phaseStartedAt: now - (dur - current.pausedRemainingMs),
                running: true,
            };
        } else {
            next = freshTimer(now, true);
        }
        await this.saveTimer(roomId, next);
        return next;
    }

    async pauseTimer(roomId: string, cfg: PomodoroConfig): Promise<TimerState> {
        const current = await this.getTimer(roomId, cfg);
        if (!current.running) return current;
        const dur = phaseDurationMs(current.phase, cfg);
        const remaining = Math.max(0, dur - (Date.now() - current.phaseStartedAt));
        const paused: TimerState = {
            ...current,
            running: false,
            pausedRemainingMs: remaining,
        };
        await this.saveTimer(roomId, paused);
        return paused;
    }

    async resetTimer(roomId: string): Promise<TimerState> {
        const reset: TimerState = {
            ...freshTimer(Date.now(), false),
        };
        await this.saveTimer(roomId, reset);
        return reset;
    }

    // ---- Media ---------------------------------------------------------------
    async getMedia(roomId: string): Promise<MediaState> {
        const raw = await this.client.get(StudyRoomKeys.media(roomId));
        if (!raw) {
            return { url: null, playing: false, positionSec: 0, updatedAt: Date.now() };
        }
        return JSON.parse(raw) as MediaState;
    }

    private async saveMedia(roomId: string, media: MediaState): Promise<void> {
        await this.client.set(
            StudyRoomKeys.media(roomId),
            JSON.stringify(media),
            'EX',
            STUDY_ROOM_LIVE_TTL
        );
    }

    private computedPosition(media: MediaState): number {
        if (!media.playing) return media.positionSec;
        return media.positionSec + (Date.now() - media.updatedAt) / 1000;
    }

    async setMedia(roomId: string, url: string): Promise<MediaState> {
        const media: MediaState = {
            url,
            playing: false,
            positionSec: 0,
            updatedAt: Date.now(),
        };
        await this.saveMedia(roomId, media);
        return media;
    }

    // Phát item playlist mới từ đầu (dùng khi next/prev/jump/auto-advance).
    async playItem(roomId: string, url: string | null): Promise<MediaState> {
        const media: MediaState = {
            url,
            playing: !!url,
            positionSec: 0,
            updatedAt: Date.now(),
        };
        await this.saveMedia(roomId, media);
        return media;
    }

    // ---- Playback index (playlist) ------------------------------------------
    async getCurrentIndex(roomId: string): Promise<number> {
        const raw = await this.client.get(StudyRoomKeys.playback(roomId));
        if (!raw) return 0;
        const parsed = parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    async setCurrentIndex(roomId: string, index: number): Promise<void> {
        await this.client.set(
            StudyRoomKeys.playback(roomId),
            String(Math.max(0, index)),
            'EX',
            STUDY_ROOM_LIVE_TTL
        );
    }

    // Số item playlist — mirror Redis để onLeave bỏ qua DB cho phòng không phát.
    // Cập nhật mỗi lần getState chạy (join/thêm/xoá/sắp xếp) nên luôn đủ tươi.
    async setPlaylistCount(roomId: string, count: number): Promise<void> {
        await this.client.set(
            StudyRoomKeys.playlistCount(roomId),
            String(count),
            'EX',
            STUDY_ROOM_LIVE_TTL
        );
    }

    // null = chưa có key (hết TTL/chưa từng getState) → caller tự soi DB để chắc chắn.
    async getPlaylistCount(roomId: string): Promise<number | null> {
        const raw = await this.client.get(StudyRoomKeys.playlistCount(roomId));
        if (raw === null) return null;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
    }

    async playMedia(roomId: string): Promise<MediaState> {
        const media = await this.getMedia(roomId);
        const next: MediaState = { ...media, playing: true, updatedAt: Date.now() };
        await this.saveMedia(roomId, next);
        return next;
    }

    async pauseMedia(roomId: string): Promise<MediaState> {
        const media = await this.getMedia(roomId);
        const next: MediaState = {
            ...media,
            positionSec: this.computedPosition(media),
            playing: false,
            updatedAt: Date.now(),
        };
        await this.saveMedia(roomId, next);
        return next;
    }

    async seekMedia(roomId: string, positionSec: number): Promise<MediaState> {
        const media = await this.getMedia(roomId);
        const next: MediaState = {
            ...media,
            positionSec: Math.max(0, positionSec),
            updatedAt: Date.now(),
        };
        await this.saveMedia(roomId, next);
        return next;
    }

    // ---- Chat ----------------------------------------------------------------
    async allowChat(roomId: string, userId: string): Promise<boolean> {
        // 1 msg / giây / user.
        const res = await this.client.set(
            StudyRoomKeys.chatRateLimit(roomId, userId),
            '1',
            'EX',
            1,
            'NX'
        );
        return res === 'OK';
    }

    async pushChat(roomId: string, msg: ChatMessage): Promise<void> {
        const key = StudyRoomKeys.chat(roomId);
        await this.client
            .multi()
            .lpush(key, JSON.stringify(msg))
            .ltrim(key, 0, CHAT_HISTORY_MAX - 1)
            .expire(key, STUDY_ROOM_LIVE_TTL)
            .exec();
    }

    async getChat(roomId: string, limit = 50): Promise<ChatMessage[]> {
        const raw = await this.client.lrange(
            StudyRoomKeys.chat(roomId),
            0,
            limit - 1
        );
        return raw.map((r) => JSON.parse(r) as ChatMessage).reverse();
    }

    // ---- Presence ------------------------------------------------------------
    // Set thành viên online duy trì song song với per-user key (có TTL) —
    // đọc roster = SMEMBERS + MGET, O(size phòng), không SCAN keyspace.
    async setPresence(
        roomId: string,
        userId: string,
        status: 'studying' | 'break'
    ): Promise<void> {
        await this.client
            .multi()
            .set(StudyRoomKeys.presence(roomId, userId), status, 'EX', PRESENCE_TTL)
            .sadd(StudyRoomKeys.presenceSet(roomId), userId)
            .expire(StudyRoomKeys.presenceSet(roomId), STUDY_ROOM_LIVE_TTL)
            .exec();
    }

    async clearPresence(roomId: string, userId: string): Promise<void> {
        await this.client
            .multi()
            .del(StudyRoomKeys.presence(roomId, userId))
            .srem(StudyRoomKeys.presenceSet(roomId), userId)
            .exec();
    }

    async getPresenceMap(
        roomId: string
    ): Promise<Record<string, 'studying' | 'break'>> {
        const setKey = StudyRoomKeys.presenceSet(roomId);
        const userIds: string[] = await this.client.smembers(setKey);
        const map: Record<string, 'studying' | 'break'> = {};
        if (!userIds.length) return map;

        const values = await this.client.mget(
            ...userIds.map((u) => StudyRoomKeys.presence(roomId, u))
        );
        const stale: string[] = [];
        userIds.forEach((userId, i) => {
            const v = values[i];
            if (v === 'studying' || v === 'break') map[userId] = v;
            else stale.push(userId); // key hết TTL (rớt mạng) → dọn khỏi set
        });
        if (stale.length) await this.client.srem(setKey, ...stale);
        return map;
    }

    // ---- Focus ---------------------------------------------------------------
    // Rate-limit lệnh điều khiển (timer/media) — chặn spam broadcast/DB từ 1 client.
    async allowControl(roomId: string, userId: string): Promise<boolean> {
        const res = await this.client.set(
            StudyRoomKeys.controlRateLimit(roomId, userId),
            '1',
            'PX',
            250,
            'NX'
        );
        return res === 'OK';
    }

    // Chống farm điểm: chỉ cho cộng focus 1 lần mỗi cửa sổ (server-side, không tin client).
    async allowFocusCredit(roomId: string, userId: string): Promise<boolean> {
        const res = await this.client.set(
            StudyRoomKeys.focusRateLimit(roomId, userId),
            '1',
            'EX',
            FOCUS_CREDIT_WINDOW,
            'NX'
        );
        return res === 'OK';
    }

    async incrFocus(
        roomId: string,
        userId: string,
        seconds: number
    ): Promise<void> {
        const key = StudyRoomKeys.focus(roomId, userId);
        await this.client
            .multi()
            .incrby(key, seconds)
            .expire(key, STUDY_ROOM_LIVE_TTL)
            // Dirty-set để sweep flush O(số key bẩn), không SCAN keyspace.
            .sadd(StudyRoomKeys.focusDirtySet(), `${roomId}|${userId}`)
            .expire(StudyRoomKeys.focusDirtySet(), STUDY_ROOM_LIVE_TTL)
            .exec();
    }

    // Đọc & xoá focus tích luỹ chưa flush (caller ghi xuống DB).
    // GETDEL atomic — tránh double-count khi nhiều instance/sweep chạy đồng thời.
    async takeFocus(roomId: string, userId: string): Promise<number> {
        const key = StudyRoomKeys.focus(roomId, userId);
        const val = await this.client.getdel(key);
        await this.client.srem(
            StudyRoomKeys.focusDirtySet(),
            `${roomId}|${userId}`
        );
        if (!val) return 0;
        return parseInt(val, 10) || 0;
    }

    // Danh sách focus chưa flush — đọc từ dirty-set, O(số entry bẩn).
    async pendingFocusEntries(): Promise<{ roomId: string; userId: string }[]> {
        const raw: string[] = await this.client.smembers(
            StudyRoomKeys.focusDirtySet()
        );
        const out: { roomId: string; userId: string }[] = [];
        for (const entry of raw) {
            const sep = entry.indexOf('|');
            if (sep > 0) {
                out.push({
                    roomId: entry.slice(0, sep),
                    userId: entry.slice(sep + 1),
                });
            }
        }
        return out;
    }
}
