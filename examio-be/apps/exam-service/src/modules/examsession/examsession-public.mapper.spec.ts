import { keysOf } from '../common/keys-deep.test-util';
import {
    toExamSessionPublicView,
    toExamSessionStudyView,
} from './examsession-public.mapper';

const base = {
    id: 's1',
    examRoomId: 'r1',
    status: 1,
    startTime: new Date('2026-01-01'),
    endTime: null,
    timeLimitMinutes: 30,
    autoJoinByLink: false,
    assessType: 1,
    allowRetake: false,
    maxAttempts: 1,
    showAnswersAfterSubmit: true,
    passingScore: 50,
    questionCount: null,
    questionSelectionMode: 0,
    labelQuestionConfig: null,
    shuffleQuestions: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    // sensitive extras a spread would have leaked
    accessCode: '123456',
    whitelist: ['u1'],
    createdBy: 'x',
    updatedBy: 'y',
};
const host = {
    id: 'h',
    username: 'host',
    name: 'Host',
    avatar: null,
    email: 'host@x.test',
    password: 'secret',
};
const room = {
    id: 'r1',
    title: 'T',
    description: null,
    hostId: 'h',
    quizSet: {
        id: 'q',
        title: 'Q',
        description: null,
        thumbnail: null,
        userId: 'h',
        detailsQuizQuestions: [{ quizQuestion: { answer: 'A' } }],
    },
    host,
};
const question = {
    id: 'qq',
    question: 'Q?',
    options: ['A', 'B'],
    answer: 'A',
    isCorrect: true,
};

describe('exam session mappers', () => {
    it('study view picks fields by name: no answer, isCorrect, accessCode, whitelist, email, password at any depth', () => {
        const view = toExamSessionStudyView(
            { ...base, examRoom: room } as never,
            [question],
            false
        );
        const keys = keysOf(view);
        for (const banned of [
            'answer',
            'isCorrect',
            'accessCode',
            'whitelist',
            'email',
            'password',
            'createdBy',
            'detailsQuizQuestions',
            'hostId',
        ]) {
            expect(keys).not.toContain(banned);
        }
        expect(view.questions).toEqual([
            { id: 'qq', question: 'Q?', options: ['A', 'B'] },
        ]);
        expect(view.creator).toEqual({
            id: 'h',
            username: 'host',
            name: 'Host',
            avatar: null,
        });
        expect(view.isOwner).toBe(false);
    });

    it('public view carries the session and room teaser without sensitive fields', () => {
        const view = toExamSessionPublicView({
            ...base,
            examRoom: room,
        } as never);
        const keys = keysOf(view);
        for (const banned of [
            'accessCode',
            'whitelist',
            'email',
            'password',
            'answer',
        ])
            expect(keys).not.toContain(banned);
        expect(view.examRoom.host.name).toBe('Host');
    });
});
