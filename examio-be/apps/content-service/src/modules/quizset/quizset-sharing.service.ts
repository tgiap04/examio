import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type { AuthUser } from '@examio/auth-jwt';
import { generateAccessCode } from '../common/access-code-guard';
import { applySharingUpdate, type SharingDelta } from '../common/sharing-list.util';
import {
    prepareSharingUpdate,
    toSharingView,
    type SharingView,
} from '../common/sharing-view.util';
import { QuizSetRepository } from './quizset.repository';
import { UserEnricher } from '../user-profile/user-enricher.service';

const NOT_FOUND = 'Bộ câu hỏi không tồn tại';

/** Teacher-side sharing of a quiz set. Every query is scoped by the owner (a stranger gets 404). */
@Injectable()
export class QuizsetSharingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly quizSetRepository: QuizSetRepository,
        private readonly users: UserEnricher
    ) {}

    async getSharing(id: string, user: AuthUser): Promise<SharingView> {
        const row = await this.prisma.quizSet.findFirst({
            where: { id, userId: user.id },
            select: {
                isPublic: true,
                accessCode: true,
                whitelist: true,
                codeGrantedIds: true,
            },
        });
        if (!row) throw new NotFoundException(NOT_FOUND);
        return toSharingView(this.users, row);
    }

    async updateSharing(
        id: string,
        user: AuthUser,
        dto: SharingDelta
    ): Promise<SharingView> {
        const input = await prepareSharingUpdate(
            this.users,
            id,
            user.id,
            dto,
            generateAccessCode()
        );
        const row = await applySharingUpdate(this.prisma, 'QuizSet', input);
        await this.quizSetRepository.invalidateItemCache(user.id, id);
        return toSharingView(this.users, row);
    }

    /** Rotation: a new code, and everyone who unlocked with the old one loses access. The whitelist is untouched. */
    async generateCode(
        id: string,
        user: AuthUser
    ): Promise<{ accessCode: string }> {
        const accessCode = generateAccessCode();
        const { count } = await this.prisma.quizSet.updateMany({
            where: { id, userId: user.id },
            data: { accessCode, codeGrantedIds: [] },
        });
        if (count === 0) throw new NotFoundException(NOT_FOUND);
        await this.quizSetRepository.invalidateItemCache(user.id, id);
        return { accessCode };
    }
}
