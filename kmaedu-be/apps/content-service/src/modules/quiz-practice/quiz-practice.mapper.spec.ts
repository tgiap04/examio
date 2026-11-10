import { keysOf } from '../common/keys-deep.test-util';
import {
    toAttemptView,
    toPracticeQuestions,
    toResultQuestions,
} from './quiz-practice.mapper';

const attemptRow = {
    id: 'a1',
    quizSetId: 's1',
    userId: 'u1', // must not leak
    type: 0,
    answers: { q1: 'Paris' },
    currentIndex: 2,
    markedQuestions: ['q1'],
    timeSpentSeconds: 30,
    timeLimitMinutes: null,
    isSubmitted: false,
    score: null,
    totalQuestions: 1,
    correctAnswers: 0,
    startedAt: new Date(0),
    submittedAt: null,
    updatedAt: new Date(0),
    createdBy: 'u1',
};
const questionRow = {
    id: 'q1',
    question: 'Capital?',
    options: ['Paris', 'Rome'],
    answer: 'Paris',
    createdAt: new Date(),
};

describe('quiz practice mapper', () => {
    it('pre-submit payload has no answer key and no isCorrect at any depth', () => {
        const keys = keysOf({
            attempt: toAttemptView(attemptRow as never),
            questions: toPracticeQuestions([questionRow]),
        });
        expect(keys).not.toContain('answer');
        expect(keys).not.toContain('correctAnswer');
        expect(keys).not.toContain('correctAnswers');
        expect(keys).not.toContain('isCorrect');
        expect(keys).not.toContain('userId');
        expect(keys).not.toContain('createdBy');
        expect(keys).toEqual(
            expect.arrayContaining(['id', 'question', 'options', 'currentIndex'])
        );
    });

    it('a pre-submit attempt view hides the score fields entirely', () => {
        const view = toAttemptView(attemptRow as never);
        expect(view).not.toHaveProperty('score');
        expect(view).not.toHaveProperty('correctAnswers');
    });

    it('a submitted attempt view carries the score and the result view carries the key', () => {
        const done = { ...attemptRow, isSubmitted: true, score: 10, correctAnswers: 1 };
        expect(toAttemptView(done as never)).toMatchObject({ score: 10, correctAnswers: 1 });
        expect(
            toResultQuestions([questionRow], [
                {
                    questionId: 'q1',
                    selectedAnswer: 'Paris',
                    correctAnswer: 'Paris',
                    isCorrect: true,
                },
            ])[0]
        ).toMatchObject({ id: 'q1', correctAnswer: 'Paris', isCorrect: true });
    });
});
