import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { StudyRoomService } from './study-room.service';
import { StudyRoomRole, AccessType } from './study-room.constants';

const user = { id: 'u1' } as any;

function make() {
    const repo: any = {
        inviteCodeExists: jest.fn().mockResolvedValue(false),
        createWithHost: jest.fn().mockResolvedValue({ id: 'r1' }),
        findByInviteCode: jest.fn(),
        findRoom: jest.fn(),
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
    repo.findMemberCached.mockImplementation((...args: any[]) =>
        repo.findMember(...args)
    );
    const gen = { generateId: jest.fn().mockReturnValue('gen-id') };
    const broadcaster = { closeRoom: jest.fn().mockResolvedValue(undefined) };
    const service = new StudyRoomService(repo, gen as any, broadcaster as any);
    return { service, repo, gen, broadcaster };
}

describe('StudyRoomService.joinById — comprehensive access modes', () => {
    it('PUBLIC mode: user auth vào mà không cần mã', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.PUBLIC,
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        repo.countMembers.mockResolvedValue(1);
        repo.findByIdWithMembers.mockResolvedValue({
            id: 'r1',
            accessType: AccessType.PUBLIC,
        });
        await service.joinById(user, 'r1');
        expect(repo.addMember).toHaveBeenCalledWith('r1', 'u1', StudyRoomRole.MEMBER);
    });

    it('PUBLIC mode: coi thường inviteCode nếu có', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.PUBLIC,
            inviteCode: '999999',
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        repo.countMembers.mockResolvedValue(1);
        // Dù truyền mã sai nhưng PUBLIC nên vẫn được vào
        await service.joinById(user, 'r1', '000000');
        expect(repo.addMember).toHaveBeenCalledWith('r1', 'u1', StudyRoomRole.MEMBER);
    });

    it('CODE mode: cần đúng mã để vào', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.CODE,
            inviteCode: '123456',
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        repo.countMembers.mockResolvedValue(0);
        await service.joinById(user, 'r1', '123456');
        expect(repo.addMember).toHaveBeenCalled();
    });

    it('CODE mode: mã sai → Forbidden', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.CODE,
            inviteCode: '123456',
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        await expect(service.joinById(user, 'r1', '000000')).rejects.toBeInstanceOf(
            ForbiddenException
        );
        expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('CODE mode: không cung cấp mã → Forbidden', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.CODE,
            inviteCode: '123456',
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        // undefined inviteCode
        await expect(service.joinById(user, 'r1')).rejects.toBeInstanceOf(
            ForbiddenException
        );
        expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('WHITELIST mode: user trong list → vào được', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.WHITELIST,
            whitelist: ['u1', 'u2'],
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        repo.countMembers.mockResolvedValue(0);
        await service.joinById(user, 'r1');
        expect(repo.addMember).toHaveBeenCalled();
    });

    it('WHITELIST mode: user không trong list → Forbidden', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.WHITELIST,
            whitelist: ['u2', 'u3'],
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        await expect(service.joinById(user, 'r1')).rejects.toBeInstanceOf(
            ForbiddenException
        );
        expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('WHITELIST mode: whitelist rỗng → Forbidden', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.WHITELIST,
            whitelist: [],
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        await expect(service.joinById(user, 'r1')).rejects.toBeInstanceOf(
            ForbiddenException
        );
    });

    it('WHITELIST mode: whitelist = null → xem như rỗng', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.WHITELIST,
            whitelist: null,
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        await expect(service.joinById(user, 'r1')).rejects.toBeInstanceOf(
            ForbiddenException
        );
    });

    it('banned user không vào được dù PUBLIC', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.PUBLIC,
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue({ role: 0, isBanned: true });
        await expect(service.joinById(user, 'r1')).rejects.toBeInstanceOf(
            ForbiddenException
        );
        expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('banned user không vào được dù có đúng mã CODE', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.CODE,
            inviteCode: '123456',
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue({ role: 0, isBanned: true });
        await expect(service.joinById(user, 'r1', '123456')).rejects.toBeInstanceOf(
            ForbiddenException
        );
        expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('room không tồn tại → NotFound', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue(null);
        await expect(service.joinById(user, 'nonexistent')).rejects.toBeInstanceOf(
            NotFoundException
        );
    });

    it('room đóng → Forbidden dù PUBLIC', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: false,
            accessType: AccessType.PUBLIC,
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        await expect(service.joinById(user, 'r1')).rejects.toBeInstanceOf(
            ForbiddenException
        );
    });

    it('room đầy → Conflict', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.PUBLIC,
            maxParticipants: 2,
        });
        repo.findMember.mockResolvedValue(null);
        repo.countMembers.mockResolvedValue(2);
        await expect(service.joinById(user, 'r1')).rejects.toBeInstanceOf(
            ConflictException
        );
        expect(repo.addMember).not.toHaveBeenCalled();
    });
});

describe('StudyRoomService.joinById — redaction per role', () => {
    it('MEMBER thấy không thấy inviteCode', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.PUBLIC,
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        repo.countMembers.mockResolvedValue(1);
        repo.findByIdWithMembers.mockResolvedValue({
            id: 'r1',
            inviteCode: '123456',
        });
        const room = await service.joinById(user, 'r1');
        expect(room.inviteCode).toBeUndefined();
    });

    it('member mới join không thấy whitelist', async () => {
        const { service, repo } = make();
        repo.findRoom.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.PUBLIC,
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        repo.countMembers.mockResolvedValue(1);
        repo.findByIdWithMembers.mockResolvedValue({
            id: 'r1',
            whitelist: ['u1', 'u2'],
        });
        const room = await service.joinById(user, 'r1');
        expect(room.whitelist).toBeUndefined();
    });
});

describe('StudyRoomService.joinByCode + accessType interaction', () => {
    it('joinByCode bypass accessType check (codeVerified=true)', async () => {
        const { service, repo } = make();
        // Setup: CODE mode nhưng joinByCode không cần CODE
        repo.findByInviteCode.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.CODE,
            inviteCode: '123456',
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        repo.countMembers.mockResolvedValue(0);
        repo.findByIdWithMembers.mockResolvedValue({ id: 'r1' });
        // joinByCode gọi applyJoin với codeVerified=true, luôn được vào
        await service.joinByCode(user, '123456');
        expect(repo.addMember).toHaveBeenCalled();
    });

    it('joinByCode với WHITELIST → vẫn được vào (codeVerified bypass)', async () => {
        const { service, repo } = make();
        repo.findByInviteCode.mockResolvedValue({
            id: 'r1',
            isActive: true,
            accessType: AccessType.WHITELIST,
            whitelist: ['someone-else'],
            maxParticipants: 20,
        });
        repo.findMember.mockResolvedValue(null);
        repo.countMembers.mockResolvedValue(0);
        repo.findByIdWithMembers.mockResolvedValue({ id: 'r1' });
        // joinByCode codeVerified=true → bypass whitelist check
        await service.joinByCode(user, 'mecode');
        expect(repo.addMember).toHaveBeenCalled();
    });
});
