import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@examio/common';
import { PrismaService } from '@examio/database';
import { RedisService, EXPIRED_TIME } from '@examio/redis';
import { StudyRoom, StudyRoomMember } from '@prisma/client';
import { StudyRoomKeys } from './study-room.constants';
import { UserEnricher } from '../user-profile/user-enricher.service';

// Giá trị đánh dấu "không phải member" trong cache (negative caching).
const MEMBER_NONE = 'none';

@Injectable()
export class StudyRoomRepository extends BaseRepository<StudyRoom> {
    protected modelName = 'studyRoom';
    protected cachePrefix = 'study_room';
    protected defaultCacheTTL = EXPIRED_TIME.FIVE_MINUTES;

    constructor(
        prisma: PrismaService,
        redis: RedisService,
        private readonly users: UserEnricher
    ) {
        super(prisma, redis);
    }

    // Roster/leaderboard display data lives in auth: members get `user` from ONE
    // batched profile lookup (never a relation include).
    private async withMemberUsers<T extends { members: Array<{ userId: string }> }>(
        room: T
    ) {
        return {
            ...room,
            members: await this.users.withUsers(room.members),
        };
    }

    private get memberModel() {
        return this.prisma.studyRoomMember;
    }

    private get playlistModel() {
        return this.prisma.studyRoomPlaylistItem;
    }

    private get blockModel() {
        return this.prisma.studyRoomChatBlock;
    }

    async findByInviteCode(inviteCode: string): Promise<StudyRoom | null> {
        return this.model.findUnique({ where: { inviteCode } });
    }

    async findRoom(id: string): Promise<StudyRoom | null> {
        return this.model.findUnique({ where: { id } });
    }

    // Room config cached 60s — heartbeat/control đọc mỗi vài giây, config gần như bất biến.
    async findRoomCached(id: string): Promise<StudyRoom | null> {
        const key = StudyRoomKeys.room(id);
        const cached = await this.redis.get<StudyRoom>(key);
        if (cached) return cached;
        const room = await this.findRoom(id);
        if (room) await this.redis.set(key, room, EXPIRED_TIME.ONE_MINUTE);
        return room;
    }

    async invalidateRoomCache(id: string): Promise<void> {
        await this.redis.del(StudyRoomKeys.room(id));
    }

    // Membership cached 60s (kể cả negative) — assertRole chạy trên MỌI sự kiện WS,
    // không được đánh DB mỗi tin chat. Invalidate ở add/remove/setRole.
    async findMemberCached(
        studyRoomId: string,
        userId: string
    ): Promise<StudyRoomMember | null> {
        const key = StudyRoomKeys.member(studyRoomId, userId);
        const cached = await this.redis.get<StudyRoomMember | string>(key);
        if (cached) return cached === MEMBER_NONE ? null : (cached as StudyRoomMember);
        const member = await this.findMember(studyRoomId, userId);
        await this.redis.set(key, member ?? MEMBER_NONE, EXPIRED_TIME.ONE_MINUTE);
        return member;
    }

    async invalidateMemberCache(
        studyRoomId: string,
        userId: string
    ): Promise<void> {
        await this.redis.del(StudyRoomKeys.member(studyRoomId, userId));
    }

    async setCurrentMedia(id: string, url: string | null): Promise<void> {
        await this.model.updateMany({
            where: { id },
            data: { currentMediaUrl: url },
        });
    }

    async inviteCodeExists(inviteCode: string): Promise<boolean> {
        const count = await this.model.count({ where: { inviteCode } });
        return count > 0;
    }

    // Chi tiết phòng kèm members (đã join user) — không cache để roster luôn tươi.
    async findByIdWithMembers(id: string): Promise<any> {
        const room = await this.model.findUnique({
            where: { id },
            include: {
                members: { orderBy: { joinedAt: 'asc' } },
            },
        });
        return room && this.withMemberUsers(room);
    }

    // Phòng tôi host hoặc tôi là member — một query, tránh N+1.
    async findMine(userId: string): Promise<any[]> {
        const rooms = await this.model.findMany({
            where: {
                OR: [{ hostId: userId }, { members: { some: { userId } } }],
            },
            orderBy: { updatedAt: 'desc' },
            include: {
                _count: { select: { members: true } },
            },
        });
        return this.users.withHosts(rooms);
    }

    async createWithHost(
        data: Omit<
            StudyRoom,
            | 'createdAt'
            | 'updatedAt'
            | 'createdBy'
            | 'updatedBy'
            | 'accessType'
            | 'whitelist'
            | 'playlistAddPermission'
        >,
        hostUserId: string
    ): Promise<any> {
        const room = await this.model.create({
            data: {
                ...data,
                createdBy: hostUserId,
                members: {
                    create: { userId: hostUserId, role: 2 }, // HOST
                },
            },
            include: { members: true },
        });
        return this.withMemberUsers(room);
    }

    // Member helpers ----------------------------------------------------------
    async findMember(
        studyRoomId: string,
        userId: string
    ): Promise<StudyRoomMember | null> {
        return this.memberModel.findUnique({
            where: { studyRoomId_userId: { studyRoomId, userId } },
        });
    }

    async addMember(
        studyRoomId: string,
        userId: string,
        role = 0
    ): Promise<StudyRoomMember> {
        const member = await this.memberModel.create({
            data: { studyRoomId, userId, role },
        });
        await this.invalidateMemberCache(studyRoomId, userId);
        return member;
    }

    async removeMember(studyRoomId: string, userId: string): Promise<void> {
        await this.memberModel.deleteMany({ where: { studyRoomId, userId } });
        await this.invalidateMemberCache(studyRoomId, userId);
    }

    // Đếm cho sức chứa — KHÔNG tính member bị ban (họ không chiếm chỗ).
    async countMembers(studyRoomId: string): Promise<number> {
        return this.memberModel.count({
            where: { studyRoomId, isBanned: false },
        });
    }

    // Danh sách member gọn (userId/role/joinedAt) theo thứ tự vào — dùng bầu leader.
    async listMembersLite(studyRoomId: string): Promise<
        { userId: string; role: number; joinedAt: Date }[]
    > {
        return this.memberModel.findMany({
            where: { studyRoomId },
            orderBy: { joinedAt: 'asc' },
            select: { userId: true, role: true, joinedAt: true },
        });
    }

    async setMemberRole(
        studyRoomId: string,
        userId: string,
        role: number
    ): Promise<void> {
        await this.memberModel.updateMany({
            where: { studyRoomId, userId },
            data: { role },
        });
        await this.invalidateMemberCache(studyRoomId, userId);
    }

    async updateLastSeen(studyRoomId: string, userId: string): Promise<void> {
        await this.memberModel.updateMany({
            where: { studyRoomId, userId },
            data: { lastSeenAt: new Date() },
        });
    }

    async incrementFocus(
        studyRoomId: string,
        userId: string,
        seconds: number
    ): Promise<void> {
        await this.memberModel.updateMany({
            where: { studyRoomId, userId },
            data: { totalFocusSeconds: { increment: seconds } },
        });
    }

    async leaderboard(studyRoomId: string): Promise<any[]> {
        const members = await this.memberModel.findMany({
            where: { studyRoomId },
            orderBy: { totalFocusSeconds: 'desc' },
        });
        return this.users.withUsers(members);
    }

    async setBanned(
        studyRoomId: string,
        userId: string,
        isBanned: boolean
    ): Promise<void> {
        await this.memberModel.updateMany({
            where: { studyRoomId, userId },
            data: { isBanned },
        });
        await this.invalidateMemberCache(studyRoomId, userId);
    }

    async setMuted(
        studyRoomId: string,
        userId: string,
        isMuted: boolean
    ): Promise<void> {
        await this.memberModel.updateMany({
            where: { studyRoomId, userId },
            data: { isMuted },
        });
        await this.invalidateMemberCache(studyRoomId, userId);
    }

    // Playlist -----------------------------------------------------------------
    async listPlaylist(studyRoomId: string): Promise<any[]> {
        return this.playlistModel.findMany({
            where: { studyRoomId },
            orderBy: { order: 'asc' },
        });
    }

    async addPlaylistItem(data: {
        studyRoomId: string;
        url: string;
        kind: number;
        title?: string | null;
        addedByUserId: string;
    }): Promise<any> {
        const last = await this.playlistModel.findFirst({
            where: { studyRoomId: data.studyRoomId },
            orderBy: { order: 'desc' },
            select: { order: true },
        });
        const order = (last?.order ?? -1) + 1;
        return this.playlistModel.create({
            data: { ...data, title: data.title ?? null, order },
        });
    }

    async removePlaylistItem(
        studyRoomId: string,
        itemId: string
    ): Promise<void> {
        await this.playlistModel.deleteMany({
            where: { id: itemId, studyRoomId },
        });
    }

    // Gán lại order theo thứ tự itemIds (chỉ những item thuộc phòng).
    async reorderPlaylist(
        studyRoomId: string,
        itemIds: string[]
    ): Promise<void> {
        await this.prisma.$transaction(
            itemIds.map((id, index) =>
                this.playlistModel.updateMany({
                    where: { id, studyRoomId },
                    data: { order: index },
                })
            )
        );
    }

    // Chặn cá nhân -------------------------------------------------------------
    async addBlock(
        studyRoomId: string,
        blockerId: string,
        blockedId: string
    ): Promise<void> {
        await this.blockModel.upsert({
            where: {
                studyRoomId_blockerId_blockedId: {
                    studyRoomId,
                    blockerId,
                    blockedId,
                },
            },
            update: {},
            create: { studyRoomId, blockerId, blockedId },
        });
    }

    async removeBlock(
        studyRoomId: string,
        blockerId: string,
        blockedId: string
    ): Promise<void> {
        await this.blockModel.deleteMany({
            where: { studyRoomId, blockerId, blockedId },
        });
    }

    async listBlockedIds(
        studyRoomId: string,
        blockerId: string
    ): Promise<string[]> {
        const rows = await this.blockModel.findMany({
            where: { studyRoomId, blockerId },
            select: { blockedId: true },
        });
        return rows.map((r) => r.blockedId);
    }
}
