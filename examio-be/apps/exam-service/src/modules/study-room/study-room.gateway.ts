import {
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RedisService } from '@examio/redis';
import { CONFIG_PAGES_KEY } from '@examio/common';
import { StudyRoomSocketAuth } from './study-room-socket-auth.service';
import { StudyRoomService } from './study-room.service';
import { StudyRoomRepository } from './study-room.repository';
import { StudyRoomStateService } from './study-room-state.service';
import { StudyRoomBroadcaster } from './study-room-broadcaster.service';
import {
    StudyRoomRole,
    FOCUS_CREDIT_SECONDS,
    PlaylistAddPermission,
    MAX_PLAYLIST_ITEMS,
} from './study-room.constants';
import { PomodoroConfig } from './study-room-pomodoro';
import {
    isValidYouTubeUrl,
    isUnplayableRadioMix,
    sanitizeChat,
} from './study-room.util';
import { StudyRoomPlaylistService } from './study-room-playlist.service';
import {
    WS_STUDY_PATH,
    ClientEvents,
    ServerEvents,
    RosterEntry,
    MediaState,
    PlaylistState,
} from './study-room.events';

const cfgFromRoom = (r: any): PomodoroConfig => ({
    workMinutes: r.workMinutes,
    breakMinutes: r.breakMinutes,
    longBreakMinutes: r.longBreakMinutes,
    cyclesBeforeLongBreak: r.cyclesBeforeLongBreak,
});

// Origin allowlist tường minh — KHÔNG fallback `true`: cookie auth là
// sameSite=none ở prod, reflect-any-origin sẽ mở cửa CSWSH.
// Prod thiếu FRONTEND_URL → main.ts đã fail-fast từ bootstrap.
function wsAllowedOrigins(): string[] {
    const configured = (process.env.FRONTEND_URL || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    if (process.env.NODE_ENV === 'production') return configured;
    return [
        ...configured,
        'http://localhost:5173',
        'http://localhost:3001',
        'http://127.0.0.1:5173',
    ];
}

@WebSocketGateway({
    path: WS_STUDY_PATH,
    cors: { origin: wsAllowedOrigins(), credentials: true },
})
export class StudyRoomGateway
    implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy
{
    @WebSocketServer() server: Server;
    private focusSweep?: NodeJS.Timeout;

    constructor(
        private readonly auth: StudyRoomSocketAuth,
        private readonly service: StudyRoomService,
        private readonly repo: StudyRoomRepository,
        private readonly state: StudyRoomStateService,
        private readonly broadcaster: StudyRoomBroadcaster,
        private readonly redis: RedisService,
        private readonly playlist: StudyRoomPlaylistService
    ) {}

    // Phòng thủ lớp 2: gateway (phía trước) đã chặn upgrade khi trang bị tắt,
    // nhưng nếu exam-service từng bị lộ thẳng (bỏ qua gateway) thì đây là chốt
    // cuối. Cùng key Redis mà admin-service publish/gateway ConfigService đọc.
    // Default-on — chỉ chặn khi === false; lỗi đọc Redis thì fail-open.
    private async isStudyRoomPageEnabled(): Promise<boolean> {
        try {
            const pages = await this.redis.get<Record<string, boolean>>(
                CONFIG_PAGES_KEY
            );
            return pages?.['study-room'] !== false;
        } catch {
            return true;
        }
    }

    afterInit(server: Server) {
        this.broadcaster.setServer(server);
        // Auth + page-gate CHẠY TRONG handshake (socket.io middleware), không phải
        // handleConnection. Lý do: handleConnection là async nhưng socket.io KHÔNG
        // await nó — client nhận 'connect' và emit room:join ngay, nên nếu set
        // socket.data.user trong handleConnection thì onJoin có thể chạy trước khi
        // auth xong (socket.data.user=undefined → assertRole ném → FORBIDDEN giả).
        // Middleware bảo đảm socket.data.user đã sẵn sàng TRƯỚC mọi message handler.
        server.use(async (socket: Socket, next: (err?: Error) => void) => {
            try {
                const user = await this.auth.authenticate(socket);
                if (!user) return next(new Error('UNAUTHORIZED'));
                if (!(await this.isStudyRoomPageEnabled())) {
                    return next(new Error('PAGE_DISABLED'));
                }
                socket.data.user = user;
                socket.data.rooms = new Set<string>();
                next();
            } catch {
                next(new Error('UNAUTHORIZED'));
            }
        });
        // Flush focus tích luỹ về DB định kỳ (an toàn nếu client rớt mà không disconnect sạch).
        this.focusSweep = setInterval(() => void this.flushAllFocus(), 5 * 60_000);
    }

    onModuleDestroy() {
        if (this.focusSweep) clearInterval(this.focusSweep);
    }

    async handleDisconnect(socket: Socket) {
        const user = socket.data.user;
        const rooms: Set<string> = socket.data.rooms ?? new Set();
        for (const roomId of rooms) {
            await this.onLeave(socket, roomId, user);
        }
    }

    @SubscribeMessage(ClientEvents.JOIN)
    async onJoin(socket: Socket, { roomId }: { roomId: string }) {
        const user = socket.data.user;
        let member;
        try {
            member = await this.service.assertRole(roomId, user.id);
        } catch {
            socket.emit(ServerEvents.ERROR, {
                code: 'FORBIDDEN',
                message: 'Bạn không ở trong phòng này',
            });
            return;
        }
        if (member.isBanned) {
            socket.emit(ServerEvents.ERROR, {
                code: 'BANNED',
                message: 'Bạn đã bị cấm khỏi phòng này',
            });
            socket.disconnect(true);
            return;
        }
        socket.join(roomId);
        (socket.data.rooms as Set<string>).add(roomId);
        await this.repo.updateLastSeen(roomId, user.id);
        socket.emit(ServerEvents.SNAPSHOT, await this.buildSnapshot(roomId, user.id));
        socket.to(roomId).emit(ServerEvents.PRESENCE_UPDATED, {
            userId: user.id,
            online: true,
            status: null,
        });
    }

    @SubscribeMessage(ClientEvents.LEAVE)
    async onLeaveMsg(socket: Socket, { roomId }: { roomId: string }) {
        await this.onLeave(socket, roomId, socket.data.user);
        socket.leave(roomId);
        (socket.data.rooms as Set<string>)?.delete(roomId);
    }

    private async onLeave(socket: Socket, roomId: string, user: any) {
        await this.flushFocus(roomId, user.id);
        await this.state.clearPresence(roomId, user.id);
        socket.to(roomId).emit(ServerEvents.PRESENCE_UPDATED, {
            userId: user.id,
            online: false,
            status: null,
        });
        // Leader có thể vừa rời → bầu lại + broadcast để client không giữ leader cũ
        // (nếu không, không ai gửi media:ended, playlist đứng). Chỉ khi có playlist.
        const state = await this.playlist.getState(roomId);
        if (state.items.length > 0) {
            socket.to(roomId).emit(ServerEvents.PLAYLIST_UPDATED, state);
        }
    }

    @SubscribeMessage(ClientEvents.HEARTBEAT)
    async onHeartbeat(
        socket: Socket,
        { roomId, status }: { roomId: string; status: 'studying' | 'break' }
    ) {
        const user = socket.data.user;
        if (!(socket.data.rooms as Set<string>)?.has(roomId)) return;
        const safeStatus = status === 'studying' ? 'studying' : 'break';
        await this.state.setPresence(roomId, user.id, safeStatus);

        if (safeStatus === 'studying') {
            const room = await this.repo.findRoomCached(roomId);
            if (room) {
                const timer = await this.state.getTimer(roomId, cfgFromRoom(room));
                // Chỉ cộng khi đang học thật + qua cửa sổ chống farm (server-side).
                if (
                    timer.running &&
                    timer.phase === 'work' &&
                    (await this.state.allowFocusCredit(roomId, user.id))
                ) {
                    await this.state.incrFocus(roomId, user.id, FOCUS_CREDIT_SECONDS);
                }
            }
        }
        socket.to(roomId).emit(ServerEvents.PRESENCE_UPDATED, {
            userId: user.id,
            online: true,
            status: safeStatus,
        });
    }

    // ---- Timer (COHOST+) -----------------------------------------------------
    @SubscribeMessage(ClientEvents.TIMER_START)
    async onTimerStart(socket: Socket, { roomId }: { roomId: string }) {
        const cfg = await this.control(socket, roomId);
        if (!cfg) return;
        this.emitTimer(roomId, await this.state.startTimer(roomId, cfg), cfg);
    }

    @SubscribeMessage(ClientEvents.TIMER_PAUSE)
    async onTimerPause(socket: Socket, { roomId }: { roomId: string }) {
        const cfg = await this.control(socket, roomId);
        if (!cfg) return;
        this.emitTimer(roomId, await this.state.pauseTimer(roomId, cfg), cfg);
    }

    @SubscribeMessage(ClientEvents.TIMER_RESET)
    async onTimerReset(socket: Socket, { roomId }: { roomId: string }) {
        const cfg = await this.control(socket, roomId);
        if (!cfg) return;
        this.emitTimer(roomId, await this.state.resetTimer(roomId), cfg);
    }

    @SubscribeMessage(ClientEvents.TIMER_CONFIG)
    async onTimerConfig(socket: Socket, payload: any) {
        const user = socket.data.user;
        const roomId = payload.roomId;
        if (!(await this.hasRole(socket, roomId, StudyRoomRole.HOST))) return;
        if (!(await this.state.allowControl(roomId, user.id))) return;
        // Clamp theo đúng bounds của REST DTO — WS không được vượt rào validation.
        const BOUNDS: Record<string, [number, number]> = {
            workMinutes: [1, 180],
            breakMinutes: [1, 60],
            longBreakMinutes: [1, 60],
            cyclesBeforeLongBreak: [1, 12],
        };
        const data: any = {};
        for (const [k, [min, max]] of Object.entries(BOUNDS)) {
            const v = payload[k];
            if (typeof v === 'number' && Number.isFinite(v)) {
                data[k] = Math.min(max, Math.max(min, Math.round(v)));
            }
        }
        if (Object.keys(data).length) {
            await this.repo.update(roomId, data, user.id);
            await this.repo.invalidateRoomCache(roomId);
        }
        const room = await this.repo.findRoom(roomId);
        if (!room) return;
        const cfg = cfgFromRoom(room);
        this.emitTimer(roomId, await this.state.getTimer(roomId, cfg), cfg);
    }

    // ---- Media (COHOST+) -----------------------------------------------------
    @SubscribeMessage(ClientEvents.MEDIA_SET)
    async onMediaSet(socket: Socket, { roomId, url }: { roomId: string; url: string }) {
        if (!(await this.control(socket, roomId))) return;
        if (!isValidYouTubeUrl(url)) {
            socket.emit(ServerEvents.ERROR, {
                code: 'VALIDATION',
                message: 'Link YouTube không hợp lệ',
            });
            return;
        }
        await this.repo.setCurrentMedia(roomId, url.trim());
        this.server
            .to(roomId)
            .emit(ServerEvents.MEDIA_UPDATED, await this.state.setMedia(roomId, url.trim()));
    }

    @SubscribeMessage(ClientEvents.MEDIA_PLAY)
    async onMediaPlay(socket: Socket, { roomId }: { roomId: string }) {
        if (!(await this.control(socket, roomId))) return;
        this.server
            .to(roomId)
            .emit(ServerEvents.MEDIA_UPDATED, await this.state.playMedia(roomId));
    }

    @SubscribeMessage(ClientEvents.MEDIA_PAUSE)
    async onMediaPause(socket: Socket, { roomId }: { roomId: string }) {
        if (!(await this.control(socket, roomId))) return;
        this.server
            .to(roomId)
            .emit(ServerEvents.MEDIA_UPDATED, await this.state.pauseMedia(roomId));
    }

    @SubscribeMessage(ClientEvents.MEDIA_SEEK)
    async onMediaSeek(
        socket: Socket,
        { roomId, positionSec }: { roomId: string; positionSec: number }
    ) {
        if (!(await this.control(socket, roomId))) return;
        const pos = Math.max(0, Number(positionSec) || 0);
        this.server
            .to(roomId)
            .emit(ServerEvents.MEDIA_UPDATED, await this.state.seekMedia(roomId, pos));
    }

    // ---- Chat (member) -------------------------------------------------------
    @SubscribeMessage(ClientEvents.CHAT_SEND)
    async onChat(socket: Socket, { roomId, content }: { roomId: string; content: string }) {
        const user = socket.data.user;
        let member;
        try {
            member = await this.service.assertRole(roomId, user.id);
        } catch {
            return;
        }
        if (member.isMuted) {
            socket.emit(ServerEvents.ERROR, {
                code: 'MUTED',
                message: 'Bạn đã bị cấm chat trong phòng này',
            });
            return;
        }
        const clean = sanitizeChat(content);
        if (!clean) return;
        if (!(await this.state.allowChat(roomId, user.id))) return;
        const message = {
            userId: user.id,
            name: user.name ?? 'Ẩn danh',
            content: clean,
            at: Date.now(),
        };
        await this.state.pushChat(roomId, message);
        this.server.to(roomId).emit(ServerEvents.CHAT_MESSAGE, { message });
    }

    // ---- Roles (HOST) --------------------------------------------------------
    @SubscribeMessage(ClientEvents.ROLE_GRANT)
    async onGrant(socket: Socket, { roomId, userId }: { roomId: string; userId: string }) {
        await this.changeRole(socket, roomId, userId, StudyRoomRole.COHOST);
    }

    @SubscribeMessage(ClientEvents.ROLE_REVOKE)
    async onRevoke(socket: Socket, { roomId, userId }: { roomId: string; userId: string }) {
        await this.changeRole(socket, roomId, userId, StudyRoomRole.MEMBER);
    }

    // ---- Playlist ------------------------------------------------------------
    @SubscribeMessage(ClientEvents.PLAYLIST_ADD)
    async onPlaylistAdd(socket: Socket, { roomId, url }: { roomId: string; url: string }) {
        if (!(await this.canAddPlaylist(socket, roomId))) return;
        if (!isValidYouTubeUrl(url)) {
            socket.emit(ServerEvents.ERROR, {
                code: 'VALIDATION',
                message: 'Link YouTube không hợp lệ',
            });
            return;
        }
        if (isUnplayableRadioMix(url)) {
            socket.emit(ServerEvents.ERROR, {
                code: 'VALIDATION',
                message:
                    "Link 'Mix' cá nhân của YouTube không phát được. Hãy dùng link video hoặc link playlist (playlist?list=PL...).",
            });
            return;
        }
        const current = await this.playlist.getState(roomId);
        if (current.items.length >= MAX_PLAYLIST_ITEMS) {
            socket.emit(ServerEvents.ERROR, {
                code: 'PLAYLIST_FULL',
                message: `Playlist đã đạt tối đa ${MAX_PLAYLIST_ITEMS} bài`,
            });
            return;
        }
        const state = await this.playlist.add(roomId, url, socket.data.user.id);
        this.server.to(roomId).emit(ServerEvents.PLAYLIST_UPDATED, state);
    }

    @SubscribeMessage(ClientEvents.PLAYLIST_REMOVE)
    async onPlaylistRemove(socket: Socket, { roomId, itemId }: { roomId: string; itemId: string }) {
        if (!(await this.control(socket, roomId))) return;
        this.broadcastPlaylist(roomId, await this.playlist.remove(roomId, itemId));
    }

    @SubscribeMessage(ClientEvents.PLAYLIST_REORDER)
    async onPlaylistReorder(socket: Socket, { roomId, itemIds }: { roomId: string; itemIds: string[] }) {
        if (!(await this.control(socket, roomId))) return;
        if (!Array.isArray(itemIds) || itemIds.length > MAX_PLAYLIST_ITEMS) return;
        const state = await this.playlist.reorder(roomId, itemIds);
        this.server.to(roomId).emit(ServerEvents.PLAYLIST_UPDATED, state);
    }

    @SubscribeMessage(ClientEvents.PLAYLIST_NEXT)
    async onPlaylistNext(socket: Socket, { roomId }: { roomId: string }) {
        if (!(await this.control(socket, roomId))) return;
        this.broadcastPlaylist(roomId, await this.playlist.step(roomId, 1));
    }

    @SubscribeMessage(ClientEvents.PLAYLIST_PREV)
    async onPlaylistPrev(socket: Socket, { roomId }: { roomId: string }) {
        if (!(await this.control(socket, roomId))) return;
        this.broadcastPlaylist(roomId, await this.playlist.step(roomId, -1));
    }

    @SubscribeMessage(ClientEvents.PLAYLIST_JUMP)
    async onPlaylistJump(socket: Socket, { roomId, index }: { roomId: string; index: number }) {
        if (!(await this.control(socket, roomId))) return;
        this.broadcastPlaylist(roomId, await this.playlist.jump(roomId, Number(index) || 0));
    }

    // CHỈ leader được báo hết video → server tự advance (chống client giả mạo tua playlist).
    @SubscribeMessage(ClientEvents.MEDIA_ENDED)
    async onMediaEnded(socket: Socket, { roomId, index }: { roomId: string; index: number }) {
        const user = socket.data.user;
        if (!(socket.data.rooms as Set<string>)?.has(roomId)) return;
        if (!(await this.state.allowControl(roomId, user.id))) return; // throttle spam
        const leader = await this.playlist.computeLeader(roomId);
        if (leader !== user.id) return; // không phải leader → bỏ qua
        const result = await this.playlist.advanceOnEnded(roomId, Number(index) || 0);
        if (result) this.broadcastPlaylist(roomId, result);
    }

    // ---- Chặn cá nhân (server-persist, client-filter) ------------------------
    @SubscribeMessage(ClientEvents.CHAT_BLOCK)
    async onChatBlock(socket: Socket, { roomId, userId }: { roomId: string; userId: string }) {
        const me = socket.data.user;
        if (!userId || userId === me.id) return;
        try {
            await this.service.assertRole(roomId, me.id);
        } catch {
            return;
        }
        await this.repo.addBlock(roomId, me.id, userId);
        await this.emitMyBlocks(socket, roomId, me.id);
    }

    @SubscribeMessage(ClientEvents.CHAT_UNBLOCK)
    async onChatUnblock(socket: Socket, { roomId, userId }: { roomId: string; userId: string }) {
        const me = socket.data.user;
        try {
            await this.service.assertRole(roomId, me.id);
        } catch {
            return;
        }
        await this.repo.removeBlock(roomId, me.id, userId);
        await this.emitMyBlocks(socket, roomId, me.id);
    }

    // ---- Moderation (HOST/COHOST) --------------------------------------------
    @SubscribeMessage(ClientEvents.MEMBER_BAN)
    async onBan(socket: Socket, { roomId, userId }: { roomId: string; userId: string }) {
        await this.moderate(socket, roomId, userId, 'ban');
    }

    @SubscribeMessage(ClientEvents.MEMBER_UNBAN)
    async onUnban(socket: Socket, { roomId, userId }: { roomId: string; userId: string }) {
        await this.moderate(socket, roomId, userId, 'unban');
    }

    @SubscribeMessage(ClientEvents.MEMBER_MUTE)
    async onMute(socket: Socket, { roomId, userId }: { roomId: string; userId: string }) {
        await this.moderate(socket, roomId, userId, 'mute');
    }

    @SubscribeMessage(ClientEvents.MEMBER_UNMUTE)
    async onUnmute(socket: Socket, { roomId, userId }: { roomId: string; userId: string }) {
        await this.moderate(socket, roomId, userId, 'unmute');
    }

    // ---- Helpers -------------------------------------------------------------
    private async hasRole(
        socket: Socket,
        roomId: string,
        minRole: StudyRoomRole
    ): Promise<boolean> {
        try {
            await this.service.assertRole(roomId, socket.data.user.id, minRole);
            return true;
        } catch {
            socket.emit(ServerEvents.ERROR, {
                code: 'FORBIDDEN',
                message: 'Bạn không có quyền điều khiển phòng',
            });
            return false;
        }
    }

    // Kiểm quyền COHOST+ + rate-limit lệnh điều khiển, trả về config phòng
    // (null nếu không đủ quyền / bị throttle / phòng mất).
    private async control(
        socket: Socket,
        roomId: string
    ): Promise<PomodoroConfig | null> {
        if (!(await this.hasRole(socket, roomId, StudyRoomRole.COHOST))) return null;
        // Chặn spam: mỗi lệnh control tốn broadcast cả phòng — 4 lệnh/s/user là quá đủ.
        if (!(await this.state.allowControl(roomId, socket.data.user.id))) {
            return null;
        }
        const room = await this.repo.findRoomCached(roomId);
        return room ? cfgFromRoom(room) : null;
    }

    private async changeRole(
        socket: Socket,
        roomId: string,
        targetUserId: string,
        role: StudyRoomRole
    ) {
        if (!(await this.hasRole(socket, roomId, StudyRoomRole.HOST))) return;
        const target = await this.repo.findMember(roomId, targetUserId);
        if (!target || target.role === StudyRoomRole.HOST) return; // không đổi host
        await this.repo.setMemberRole(roomId, targetUserId, role);
        this.server
            .to(roomId)
            .emit(ServerEvents.ROLE_UPDATED, { userId: targetUserId, role });
    }

    private emitTimer(roomId: string, timer: any, config: PomodoroConfig) {
        this.server.to(roomId).emit(ServerEvents.TIMER_UPDATED, { timer, config });
    }

    // Quyền thêm bài theo playlistAddPermission + role của caller.
    private async canAddPlaylist(socket: Socket, roomId: string): Promise<boolean> {
        let member;
        try {
            member = await this.service.assertRole(roomId, socket.data.user.id);
        } catch {
            return false;
        }
        const room = await this.repo.findRoomCached(roomId);
        const perm = room?.playlistAddPermission ?? PlaylistAddPermission.COHOST;
        const min =
            perm === PlaylistAddPermission.EVERYONE
                ? StudyRoomRole.MEMBER
                : perm === PlaylistAddPermission.HOST
                  ? StudyRoomRole.HOST
                  : StudyRoomRole.COHOST;
        if (member.role < min) {
            socket.emit(ServerEvents.ERROR, {
                code: 'FORBIDDEN',
                message: 'Bạn không có quyền thêm bài vào playlist',
            });
            return false;
        }
        return true;
    }

    private broadcastPlaylist(
        roomId: string,
        result: { state: PlaylistState; media?: MediaState }
    ) {
        this.server.to(roomId).emit(ServerEvents.PLAYLIST_UPDATED, result.state);
        if (result.media) {
            this.server.to(roomId).emit(ServerEvents.MEDIA_UPDATED, result.media);
        }
    }

    // Gửi danh sách block cập nhật CHỈ cho chính người chặn (không broadcast).
    private async emitMyBlocks(socket: Socket, roomId: string, userId: string) {
        const blockedUserIds = await this.repo.listBlockedIds(roomId, userId);
        socket.emit(ServerEvents.BLOCKS_UPDATED, { blockedUserIds });
    }

    // COHOST+ ban/mute; không tác động được lên role >= mình (không hạ host/cohost ngang cấp).
    private async moderate(
        socket: Socket,
        roomId: string,
        targetUserId: string,
        action: 'ban' | 'unban' | 'mute' | 'unmute'
    ) {
        let caller;
        try {
            caller = await this.service.assertRole(
                roomId,
                socket.data.user.id,
                StudyRoomRole.COHOST
            );
        } catch {
            socket.emit(ServerEvents.ERROR, {
                code: 'FORBIDDEN',
                message: 'Bạn không có quyền kiểm duyệt',
            });
            return;
        }
        if (!targetUserId || targetUserId === socket.data.user.id) return;
        const target = await this.repo.findMember(roomId, targetUserId);
        if (!target || target.role >= caller.role) return; // không đụng ngang/trên cấp

        if (action === 'ban' || action === 'unban') {
            const isBanned = action === 'ban';
            await this.repo.setBanned(roomId, targetUserId, isBanned);
            this.server
                .to(roomId)
                .emit(ServerEvents.MEMBER_MODERATED, { userId: targetUserId, isBanned });
            if (isBanned) await this.kickUser(roomId, targetUserId);
        } else {
            const isMuted = action === 'mute';
            await this.repo.setMuted(roomId, targetUserId, isMuted);
            this.server
                .to(roomId)
                .emit(ServerEvents.MEMBER_MODERATED, { userId: targetUserId, isMuted });
        }
    }

    // Đá mọi socket của user khỏi phòng (mọi instance qua redis-adapter).
    private async kickUser(roomId: string, userId: string) {
        const sockets = await this.server.in(roomId).fetchSockets();
        for (const s of sockets) {
            if ((s.data as any)?.user?.id === userId) {
                s.emit(ServerEvents.ROOM_KICKED, { roomId });
                s.disconnect(true);
            }
        }
    }

    private async buildSnapshot(roomId: string, userId: string) {
        const room = await this.repo.findByIdWithMembers(roomId);
        if (!room) return null;
        const cfg = cfgFromRoom(room);
        const presence = await this.state.getPresenceMap(roomId);
        const myRole =
            room.members.find((m: any) => m.userId === userId)?.role ?? 0;
        const canSeeSensitive = myRole >= StudyRoomRole.COHOST;
        const roster: RosterEntry[] = room.members
            .filter((m: any) => !m.isBanned) // banned không hiện trong roster
            .map((m: any) => ({
                userId: m.userId,
                name: m.user?.name ?? null,
                avatar: m.user?.avatar ?? null,
                role: m.role,
                online: !!presence[m.userId],
                status: presence[m.userId] ?? null,
                isBanned: m.isBanned,
                isMuted: m.isMuted,
            }));
        return {
            room: {
                id: room.id,
                name: room.name,
                description: room.description,
                isActive: room.isActive,
                maxParticipants: room.maxParticipants,
                hostId: room.hostId,
                accessType: room.accessType,
                playlistAddPermission: room.playlistAddPermission,
                inviteCode: canSeeSensitive ? room.inviteCode : undefined,
                whitelist: canSeeSensitive ? room.whitelist : undefined,
            },
            config: cfg,
            timer: await this.state.getTimer(roomId, cfg),
            media: await this.state.getMedia(roomId),
            chat: await this.state.getChat(roomId, 50),
            roster,
            playlist: await this.playlist.getState(roomId),
            myBlocks: await this.repo.listBlockedIds(roomId, userId),
            myRole,
        };
    }

    private async flushFocus(roomId: string, userId: string) {
        const seconds = await this.state.takeFocus(roomId, userId);
        if (seconds > 0) await this.repo.incrementFocus(roomId, userId, seconds);
    }

    private async flushAllFocus() {
        // Dirty-set thay vì SCAN keyspace; flush theo batch giới hạn concurrency.
        const entries = await this.state.pendingFocusEntries();
        const BATCH = 20;
        for (let i = 0; i < entries.length; i += BATCH) {
            await Promise.all(
                entries
                    .slice(i, i + BATCH)
                    .map(({ roomId, userId }) => this.flushFocus(roomId, userId))
            );
        }
    }
}
