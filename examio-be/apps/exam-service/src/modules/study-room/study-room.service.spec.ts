import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { StudyRoomService } from './study-room.service';
import { StudyRoomRole } from './study-room.constants';

const user = { id: 'u1' } as any;

function make() {
    const repo: any = {
        inviteCodeExists: jest.fn().mockResolvedValue(false),
        createWithHost: jest.fn().mockResolvedValue({ id: 'r1' }),
        findByInviteCode: jest.fn(),
        findMember: jest.fn(),
        findMemberCached: jest.fn(),
        countMembers: jest.fn(),
        addMember: jest.fn(),
        removeMember: jest.fn(),
        findByIdWithMembers: jest.fn().mockResolvedValue({ id: 'r1' }),
        findMine: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'r1' }),
        delete: jest.fn().mockResolvedValue({ id: 'r1' }),
        invalidateRoomCache: jest.fn().mockResolvedValue(undefined),
        invalidateMemberCache: jest.fn().mockResolvedValue(undefined),
    };
    // assertRole đọc qua cache — mặc định trỏ về findMember để test cũ giữ nguyên semantics.
    repo.findMemberCached.mockImplementation((...args: any[]) =>
        repo.findMember(...args)
    );
    const gen = { generateId: jest.fn().mockReturnValue('gen-id') };
    const broadcaster = { closeRoom: jest.fn().mockResolvedValue(undefined) };
    const service = new StudyRoomService(repo, gen as any, broadcaster as any);
    return { service, repo, gen, broadcaster };
}

describe('StudyRoomService', () => {
    describe('createRoom', () => {
        it('sinh mã 6 số và retry khi trùng', async () => {
            const { service, repo } = make();
            repo.inviteCodeExists
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);
            await service.createRoom(user, { name: 'Phòng A' } as any);
            expect(repo.inviteCodeExists).toHaveBeenCalledTimes(2);
            const arg = repo.createWithHost.mock.calls[0][0];
            expect(arg.inviteCode).toMatch(/^\d{6}$/);
            expect(repo.createWithHost.mock.calls[0][1]).toBe('u1');
        });
    });

    describe('assertRole', () => {
        it('ném Forbidden khi không phải member', async () => {
            const { service, repo } = make();
            repo.findMember.mockResolvedValue(null);
            await expect(service.assertRole('r1', 'u1')).rejects.toBeInstanceOf(
                ForbiddenException
            );
        });
        it('ném Forbidden khi role thấp hơn yêu cầu', async () => {
            const { service, repo } = make();
            repo.findMember.mockResolvedValue({ role: StudyRoomRole.MEMBER });
            await expect(
                service.assertRole('r1', 'u1', StudyRoomRole.HOST)
            ).rejects.toBeInstanceOf(ForbiddenException);
        });
        it('trả member khi đủ quyền', async () => {
            const { service, repo } = make();
            const m = { role: StudyRoomRole.HOST };
            repo.findMember.mockResolvedValue(m);
            await expect(
                service.assertRole('r1', 'u1', StudyRoomRole.COHOST)
            ).resolves.toBe(m);
        });
    });

    describe('joinByCode', () => {
        it('NotFound khi mã sai', async () => {
            const { service, repo } = make();
            repo.findByInviteCode.mockResolvedValue(null);
            await expect(service.joinByCode(user, '000000')).rejects.toBeInstanceOf(
                NotFoundException
            );
        });
        it('Forbidden khi phòng đóng', async () => {
            const { service, repo } = make();
            repo.findByInviteCode.mockResolvedValue({ id: 'r1', isActive: false });
            await expect(service.joinByCode(user, '123456')).rejects.toBeInstanceOf(
                ForbiddenException
            );
        });
        it('Conflict khi phòng đầy', async () => {
            const { service, repo } = make();
            repo.findByInviteCode.mockResolvedValue({
                id: 'r1',
                isActive: true,
                maxParticipants: 2,
            });
            repo.findMember.mockResolvedValue(null);
            repo.countMembers.mockResolvedValue(2);
            await expect(service.joinByCode(user, '123456')).rejects.toBeInstanceOf(
                ConflictException
            );
        });
        it('idempotent khi đã là member — không add lại', async () => {
            const { service, repo } = make();
            repo.findByInviteCode.mockResolvedValue({ id: 'r1', isActive: true });
            repo.findMember.mockResolvedValue({ role: 0 });
            await service.joinByCode(user, '123456');
            expect(repo.addMember).not.toHaveBeenCalled();
            expect(repo.findByIdWithMembers).toHaveBeenCalledWith('r1');
        });
        it('thêm member khi hợp lệ', async () => {
            const { service, repo } = make();
            repo.findByInviteCode.mockResolvedValue({
                id: 'r1',
                isActive: true,
                maxParticipants: 20,
            });
            repo.findMember.mockResolvedValue(null);
            repo.countMembers.mockResolvedValue(3);
            await service.joinByCode(user, '123456');
            expect(repo.addMember).toHaveBeenCalledWith('r1', 'u1', StudyRoomRole.MEMBER);
        });
    });

    describe('leaveRoom', () => {
        it('chặn host rời phòng', async () => {
            const { service, repo } = make();
            repo.findMember.mockResolvedValue({ role: StudyRoomRole.HOST });
            await expect(service.leaveRoom('r1', user)).rejects.toBeInstanceOf(
                BadRequestException
            );
        });
        it('member rời phòng thành công', async () => {
            const { service, repo } = make();
            repo.findMember.mockResolvedValue({ role: StudyRoomRole.MEMBER });
            await service.leaveRoom('r1', user);
            expect(repo.removeMember).toHaveBeenCalledWith('r1', 'u1');
        });
    });

    describe('redact inviteCode', () => {
        it('getRoomDetail: MEMBER không thấy inviteCode', async () => {
            const { service, repo } = make();
            repo.findMember.mockResolvedValue({ role: StudyRoomRole.MEMBER });
            repo.findByIdWithMembers.mockResolvedValue({
                id: 'r1',
                inviteCode: '123456',
            });
            const room = await service.getRoomDetail('r1', user);
            expect(room.inviteCode).toBeUndefined();
        });
        it('getRoomDetail: COHOST thấy inviteCode', async () => {
            const { service, repo } = make();
            repo.findMember.mockResolvedValue({ role: StudyRoomRole.COHOST });
            repo.findByIdWithMembers.mockResolvedValue({
                id: 'r1',
                inviteCode: '123456',
            });
            const room = await service.getRoomDetail('r1', user);
            expect(room.inviteCode).toBe('123456');
        });
        it('getMyRooms: chỉ phòng mình host mới kèm inviteCode', async () => {
            const { service, repo } = make();
            repo.findMine.mockResolvedValue([
                { id: 'r1', hostId: 'u1', inviteCode: '111111' },
                { id: 'r2', hostId: 'other', inviteCode: '222222' },
            ]);
            const rooms = await service.getMyRooms(user);
            expect(rooms[0].inviteCode).toBe('111111');
            expect(rooms[1].inviteCode).toBeUndefined();
        });
        it('joinByCode: member mới join không thấy inviteCode', async () => {
            const { service, repo } = make();
            repo.findByInviteCode.mockResolvedValue({
                id: 'r1',
                isActive: true,
                maxParticipants: 20,
            });
            repo.findMember.mockResolvedValue(null);
            repo.countMembers.mockResolvedValue(1);
            repo.findByIdWithMembers.mockResolvedValue({
                id: 'r1',
                inviteCode: '123456',
            });
            const room = await service.joinByCode(user, '123456');
            expect(room.inviteCode).toBeUndefined();
        });
    });

    describe('đóng/xoá phòng', () => {
        it('updateRoom isActive=false → broadcast đóng phòng', async () => {
            const { service, repo, broadcaster } = make();
            repo.findMember.mockResolvedValue({ role: StudyRoomRole.HOST });
            await service.updateRoom('r1', user, { isActive: false } as any);
            expect(broadcaster.closeRoom).toHaveBeenCalledWith('r1');
        });
        it('deleteRoom → broadcast đóng phòng rồi xoá', async () => {
            const { service, repo, broadcaster } = make();
            repo.findMember.mockResolvedValue({ role: StudyRoomRole.HOST });
            await service.deleteRoom('r1', user);
            expect(broadcaster.closeRoom).toHaveBeenCalledWith('r1');
            expect(repo.delete).toHaveBeenCalled();
        });
    });
});
