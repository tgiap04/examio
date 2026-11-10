import {
    Injectable,
    ConflictException,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { GenerateIdService } from '@examio/common';
import { StudyRoomMember } from '../../prisma';
import { randomInt } from 'crypto';
import { StudyRoomRepository } from './study-room.repository';
import { StudyRoomRole, AccessType } from './study-room.constants';
import { CreateStudyRoomDto, UpdateStudyRoomDto } from './dto/study-room.dto';
import { StudyRoomBroadcaster } from './study-room-broadcaster.service';
import type { AuthUser } from '@examio/auth-jwt';

@Injectable()
export class StudyRoomService {
    constructor(
        private readonly repo: StudyRoomRepository,
        private readonly generateIdService: GenerateIdService,
        private readonly broadcaster: StudyRoomBroadcaster
    ) {}

    private async generateUniqueInviteCode(): Promise<string> {
        // 6-digit CSPRNG, retry vài lần nếu trùng (không gian 900k đủ rộng cho quy mô này).
        for (let attempt = 0; attempt < 8; attempt++) {
            const code = String(randomInt(100000, 1000000));
            if (!(await this.repo.inviteCodeExists(code))) return code;
        }
        throw new ConflictException('Không tạo được mã mời, thử lại sau');
    }

    // inviteCode + whitelist chỉ dành cho COHOST+ — REST và WS phải cùng luật, không drift.
    private redactSensitive<T extends object>(room: T, canSee: boolean): T {
        if (canSee) return room;
        const { inviteCode: _c, whitelist: _w, ...rest } = room as any;
        return rest as T;
    }

    async createRoom(user: AuthUser, dto: CreateStudyRoomDto) {
        const inviteCode = await this.generateUniqueInviteCode();
        return this.repo.createWithHost(
            {
                id: this.generateIdService.generateId(),
                name: dto.name,
                description: dto.description ?? null,
                hostId: user.id,
                inviteCode,
                workMinutes: dto.workMinutes ?? 30,
                breakMinutes: dto.breakMinutes ?? 5,
                longBreakMinutes: dto.longBreakMinutes ?? 15,
                cyclesBeforeLongBreak: dto.cyclesBeforeLongBreak ?? 4,
                currentMediaUrl: null,
                isActive: true,
                maxParticipants: dto.maxParticipants ?? 20,
            },
            user.id
        );
    }

    async getMyRooms(user: AuthUser) {
        const rooms = await this.repo.findMine(user.id);
        // Trong list chỉ host thấy mã mời/whitelist; co-host lấy qua detail/snapshot.
        return rooms.map((r: any) =>
            this.redactSensitive(r, r.hostId === user.id)
        );
    }

    // Xác nhận user là member và (tuỳ chọn) đủ role tối thiểu. Trả về member record.
    // Cached 60s — chạy trên MỌI sự kiện WS (chat/timer/media), không đánh DB mỗi lần.
    async assertRole(
        studyRoomId: string,
        userId: string,
        minRole: StudyRoomRole = StudyRoomRole.MEMBER
    ): Promise<StudyRoomMember> {
        const member = await this.repo.findMemberCached(studyRoomId, userId);
        if (!member) {
            throw new ForbiddenException('Bạn không ở trong phòng này');
        }
        if (member.role < minRole) {
            throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
        }
        return member;
    }

    async getRoomDetail(id: string, user: AuthUser) {
        const member = await this.assertRole(id, user.id);
        const room = await this.repo.findByIdWithMembers(id);
        if (!room) throw new NotFoundException('Phòng không tồn tại');
        return this.redactSensitive(room, member.role >= StudyRoomRole.COHOST);
    }

    async updateRoom(id: string, user: AuthUser, dto: UpdateStudyRoomDto) {
        await this.assertRole(id, user.id, StudyRoomRole.HOST);
        const updated = await this.repo.update(id, dto, user.id);
        await this.repo.invalidateRoomCache(id);
        // Host đóng phòng → đá mọi socket ra ngoài.
        if (dto.isActive === false) {
            await this.broadcaster.closeRoom(id);
        }
        return updated;
    }

    async deleteRoom(id: string, user: AuthUser) {
        await this.assertRole(id, user.id, StudyRoomRole.HOST);
        await this.broadcaster.closeRoom(id);
        await this.repo.delete(id, user.id);
        await this.repo.invalidateRoomCache(id);
        return { success: true };
    }

    // Vào phòng bằng mã mời (không cần biết roomId trước).
    async joinByCode(user: AuthUser, inviteCode: string) {
        const room = await this.repo.findByInviteCode(inviteCode);
        if (!room) throw new NotFoundException('Mã mời không hợp lệ');
        return this.applyJoin(user, room, true);
    }

    // Vào phòng bằng roomId — dùng cho public/whitelist; code thì cần inviteCode khớp.
    async joinById(user: AuthUser, roomId: string, inviteCode?: string) {
        const room = await this.repo.findRoom(roomId);
        if (!room) throw new NotFoundException('Phòng không tồn tại');
        const codeVerified =
            room.accessType === AccessType.CODE &&
            !!inviteCode &&
            inviteCode === room.inviteCode;
        return this.applyJoin(user, room, codeVerified);
    }

    // Áp luật vào phòng theo accessType + chặn banned. codeVerified = đã xác thực mã.
    private async applyJoin(user: AuthUser, room: any, codeVerified: boolean) {
        if (!room.isActive) throw new ForbiddenException('Phòng đang đóng');

        const existing = await this.repo.findMember(room.id, user.id);
        if (existing?.isBanned) {
            throw new ForbiddenException('Bạn đã bị cấm khỏi phòng này');
        }

        // Chưa là member → kiểm quyền vào. Biết mã (codeVerified) thì luôn được vào,
        // bất kể accessType; ngoài ra tuỳ mode: PUBLIC cho mọi user auth, WHITELIST theo list.
        if (!existing) {
            const allowed =
                codeVerified ||
                room.accessType === AccessType.PUBLIC ||
                (room.accessType === AccessType.WHITELIST &&
                    (room.whitelist ?? []).includes(user.id));
            if (!allowed) {
                if (room.accessType === AccessType.WHITELIST) {
                    throw new ForbiddenException(
                        'Bạn không nằm trong danh sách được phép vào phòng'
                    );
                }
                throw new ForbiddenException('Phòng yêu cầu mã mời hợp lệ');
            }
            const count = await this.repo.countMembers(room.id);
            if (count >= room.maxParticipants) {
                throw new ConflictException('Phòng đã đầy');
            }
            await this.repo.addMember(room.id, user.id, StudyRoomRole.MEMBER);
        }

        const detail = await this.repo.findByIdWithMembers(room.id);
        const role = existing?.role ?? StudyRoomRole.MEMBER;
        return this.redactSensitive(detail, role >= StudyRoomRole.COHOST);
    }

    async leaveRoom(id: string, user: AuthUser) {
        const member = await this.assertRole(id, user.id);
        if (member.role === StudyRoomRole.HOST) {
            throw new BadRequestException(
                'Host không thể rời phòng. Hãy xoá phòng hoặc đóng phòng.'
            );
        }
        await this.repo.removeMember(id, user.id);
        return { success: true };
    }

    async regenerateCode(id: string, user: AuthUser) {
        await this.assertRole(id, user.id, StudyRoomRole.HOST);
        const inviteCode = await this.generateUniqueInviteCode();
        await this.repo.update(id, { inviteCode }, user.id);
        await this.repo.invalidateRoomCache(id);
        return { inviteCode };
    }

    async getLeaderboard(id: string, user: AuthUser) {
        await this.assertRole(id, user.id);
        return this.repo.leaderboard(id);
    }
}
