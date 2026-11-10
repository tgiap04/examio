import { Injectable } from '@nestjs/common';
import { StudyRoomRepository } from './study-room.repository';
import { StudyRoomStateService } from './study-room-state.service';
import { StudyRoomRole, PlaylistItemKind } from './study-room.constants';
import { PlaylistItem, PlaylistState, MediaState } from './study-room.events';

// Member tối thiểu cần cho bầu leader — cho phép truyền sẵn (từ snapshot) để
// khỏi query lại listMembersLite/presence trên hot path.
type LeaderMember = { userId: string; role: number };
type PresenceMap = Record<string, 'studying' | 'break'>;

// Có tham số list= → phát dạng PLAYLIST (kể cả radio RD<videoId> và playlist PL...,
// đều nhúng được). NGOẠI TRỪ "My Mix" cá nhân (list=RDMM...) — YouTube không cho
// nhúng (IFrame API trả error 150) → phát item như VIDEO lẻ (dùng v= nếu có).
function detectKind(url: string): number {
    const listId = url.match(/[?&]list=([\w-]+)/)?.[1];
    const embeddableList = !!listId && !listId.startsWith('RDMM');
    return embeddableList ? PlaylistItemKind.PLAYLIST : PlaylistItemKind.VIDEO;
}

const toItem = (r: any): PlaylistItem => ({
    id: r.id,
    url: r.url,
    kind: r.kind,
    title: r.title ?? null,
    addedByUserId: r.addedByUserId,
    order: r.order,
});

// Orchestration playlist: DB items + Redis currentIndex + bầu leader.
// Gateway giữ mỏng — chỉ route + broadcast kết quả trả về từ đây.
@Injectable()
export class StudyRoomPlaylistService {
    constructor(
        private readonly repo: StudyRoomRepository,
        private readonly state: StudyRoomStateService
    ) {}

    // Leader = client duy nhất được phép báo media:ended (host online, else member online vào sớm nhất).
    // members/presence có thể truyền sẵn (từ snapshot) để không query lại.
    async computeLeader(
        roomId: string,
        members?: LeaderMember[],
        presence?: PresenceMap
    ): Promise<string | null> {
        const list = members ?? (await this.repo.listMembersLite(roomId));
        const pres = presence ?? (await this.state.getPresenceMap(roomId));
        const online = list.filter((m) => pres[m.userId] !== undefined);
        const host = online.find((m) => m.role === StudyRoomRole.HOST);
        return host?.userId ?? online[0]?.userId ?? null;
    }

    async getState(
        roomId: string,
        members?: LeaderMember[],
        presence?: PresenceMap
    ): Promise<PlaylistState> {
        const rows = await this.repo.listPlaylist(roomId);
        const items = rows.map(toItem);
        let currentIndex = await this.state.getCurrentIndex(roomId);
        if (currentIndex >= items.length) currentIndex = Math.max(0, items.length - 1);
        // Mirror số item sang Redis để onLeave bỏ qua DB cho phòng không phát.
        await this.state.setPlaylistCount(roomId, items.length);
        const leaderUserId = await this.computeLeader(roomId, members, presence);
        return { items, currentIndex, leaderUserId };
    }

    async add(
        roomId: string,
        url: string,
        addedByUserId: string
    ): Promise<PlaylistState> {
        await this.repo.addPlaylistItem({
            studyRoomId: roomId,
            url: url.trim(),
            kind: detectKind(url),
            addedByUserId,
        });
        return this.getState(roomId);
    }

    // Trả về state mới + media mới CHỈ khi item đang phát thực sự đổi.
    async remove(
        roomId: string,
        itemId: string
    ): Promise<{ state: PlaylistState; media?: MediaState }> {
        // Lấy member/presence MỘT lần, tái dùng cho cả hai getState + applyIndex
        // (tránh query listMembersLite/presence 2-3 lần cho một thao tác xoá).
        const [members, presence] = await Promise.all([
            this.repo.listMembersLite(roomId),
            this.state.getPresenceMap(roomId),
        ]);
        const before = await this.getState(roomId, members, presence);
        const removedIdx = before.items.findIndex((i) => i.id === itemId);
        await this.repo.removePlaylistItem(roomId, itemId);
        const state = await this.getState(roomId, members, presence);

        if (removedIdx === -1 || removedIdx > before.currentIndex) {
            // Xoá item SAU item đang phát → index & media không đổi.
            return { state };
        }
        if (removedIdx < before.currentIndex) {
            // Xoá item TRƯỚC item đang phát → item đó vẫn đang phát, chỉ dịch index.
            // Cập nhật currentIndex mà KHÔNG restart media (tránh giật/seek vô cớ).
            const newIdx = before.currentIndex - 1;
            await this.state.setCurrentIndex(roomId, newIdx);
            return { state: { ...state, currentIndex: newIdx } };
        }
        // removedIdx === currentIndex → item đang phát bị xoá → phát item thế chỗ.
        return this.applyIndex(roomId, before.currentIndex, state.items, members, presence);
    }

    // Đổi thứ tự KHÔNG được làm con trỏ trỏ nhầm bài: ghim id item đang phát
    // trước khi reorder, rồi kéo currentIndex theo vị trí mới của chính bài đó
    // (media KHÔNG restart — chỉ dịch con trỏ, tránh giật/tua vô cớ).
    async reorder(roomId: string, itemIds: string[]): Promise<PlaylistState> {
        const [members, presence] = await Promise.all([
            this.repo.listMembersLite(roomId),
            this.state.getPresenceMap(roomId),
        ]);
        const before = await this.getState(roomId, members, presence);
        const currentId = before.items[before.currentIndex]?.id ?? null;
        await this.repo.reorderPlaylist(roomId, itemIds);
        const state = await this.getState(roomId, members, presence);
        if (currentId) {
            const newIdx = state.items.findIndex((i) => i.id === currentId);
            if (newIdx >= 0 && newIdx !== state.currentIndex) {
                await this.state.setCurrentIndex(roomId, newIdx);
                return { ...state, currentIndex: newIdx };
            }
        }
        return state;
    }

    async jump(
        roomId: string,
        index: number
    ): Promise<{ state: PlaylistState; media?: MediaState }> {
        const rows = await this.repo.listPlaylist(roomId);
        return this.applyIndex(roomId, index, rows.map(toItem));
    }

    async step(
        roomId: string,
        delta: number
    ): Promise<{ state: PlaylistState; media?: MediaState }> {
        const current = await this.state.getCurrentIndex(roomId);
        const rows = await this.repo.listPlaylist(roomId);
        return this.applyIndex(roomId, current + delta, rows.map(toItem));
    }

    // Auto-advance khi leader báo hết video: sang item kế, dừng nếu đã cuối.
    async advanceOnEnded(
        roomId: string,
        endedIndex: number
    ): Promise<{ state: PlaylistState; media?: MediaState } | null> {
        const current = await this.state.getCurrentIndex(roomId);
        if (endedIndex !== current) return null; // chống lệch / báo trùng
        const rows = await this.repo.listPlaylist(roomId);
        if (current + 1 >= rows.length) return null; // đã cuối playlist → dừng
        return this.applyIndex(roomId, current + 1, rows.map(toItem));
    }

    // Đặt currentIndex (kẹp trong biên) + phát item mới từ đầu.
    private async applyIndex(
        roomId: string,
        index: number,
        items: PlaylistItem[],
        members?: LeaderMember[],
        presence?: PresenceMap
    ): Promise<{ state: PlaylistState; media?: MediaState }> {
        const clamped = Math.min(Math.max(0, index), Math.max(0, items.length - 1));
        await this.state.setCurrentIndex(roomId, clamped);
        const item = items[clamped];
        const url = item?.url ?? null;
        await this.repo.setCurrentMedia(roomId, url);
        const media = await this.state.playItem(roomId, url);
        const leaderUserId = await this.computeLeader(roomId, members, presence);
        return {
            state: { items, currentIndex: clamped, leaderUserId },
            media,
        };
    }
}
