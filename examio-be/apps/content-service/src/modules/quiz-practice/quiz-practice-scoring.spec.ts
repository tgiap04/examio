import { isCorrectAnswer, scoreAttempt } from './quiz-practice-scoring';

const q = (id: string, answer: string, options = ['Paris', 'Rome', 'Oslo', 'Bern']) => ({
    id,
    question: `q ${id}`,
    options,
    answer,
});

describe('quiz practice scoring', () => {
    it.each([
        ['Paris', 'Paris', true],
        [' Paris ', 'Paris', true],
        ['Rome', 'Paris', false],
        ['', 'Paris', false],
        [undefined, 'Paris', false],
        [42, 'Paris', false],
    ])('isCorrectAnswer(%p, key %p) = %p', (selected, answer, expected) => {
        expect(isCorrectAnswer(q('a', answer), selected)).toBe(expected);
    });

    it('accepts a stored letter key against the chosen option text (and the reverse)', () => {
        expect(isCorrectAnswer(q('a', 'B'), 'Rome')).toBe(true);
        expect(isCorrectAnswer(q('a', 'B'), 'Paris')).toBe(false);
        expect(isCorrectAnswer(q('a', 'Rome'), 'B')).toBe(true);
        expect(isCorrectAnswer(q('a', 'Rome'), 'A')).toBe(false);
        expect(isCorrectAnswer(q('a', 'E'), 'E')).toBe(true);
    });

    it.each([
        ['A. Paris', 'Paris', true],
        ['paris', 'Paris', true],
        ['B. Rome', 'Paris', false],
        ['Paris', 'A', true],
        ['a', 'Paris', true],
        ['Z', 'Paris', false],
        ['Par', 'Paris', false],
    ])('prefixed options: pick %p vs key %p = %p', (selected, answer, expected) => {
        const prefixed = q('p', answer, ['A. Paris', 'B. Rome', 'C. Oslo', 'D. Bern']);
        expect(isCorrectAnswer(prefixed, selected)).toBe(expected);
    });

    it.each([
        // options whose TEXT is a single letter, in shuffled order: a letter key/pick is a POSITION
        ['A', 'A', true], // key A = first option (text "B"); pick A = first option
        ['B', 'A', false], // pick B = second option (text "A"), not the key
        ['C', 'C', true],
        ['D', 'C', false],
        ['', 'A', false],
    ])('single-letter key is a position: pick %p vs key %p = %p (options B,A,C,D)', (selected, key, expected) => {
        expect(isCorrectAnswer(q('l', key, ['B', 'A', 'C', 'D']), selected)).toBe(expected);
    });

    const questions = [q('1', 'Paris'), q('2', 'Rome'), q('3', 'Oslo'), q('4', 'Bern')];

    it.each([
        ['all correct', { 1: 'Paris', 2: 'Rome', 3: 'Oslo', 4: 'Bern' }, 4, 10],
        ['none correct', { 1: 'Rome', 2: 'Paris', 3: 'Bern', 4: 'Oslo' }, 0, 0],
        ['unanswered', {}, 0, 0],
        ['half', { 1: 'Paris', 2: 'Rome' }, 2, 5],
        ['one of four', { 1: 'Paris' }, 1, 2.5],
    ])('%s', (_name, answers, correct, score) => {
        const r = scoreAttempt(questions, answers);
        expect({ correct: r.correct, score: r.score, total: r.total }).toEqual({
            correct,
            score,
            total: 4,
        });
    });

    it('rounds to 2 decimals and ignores answers for questions that are not in the set', () => {
        const three = questions.slice(0, 3);
        const r = scoreAttempt(three, { 1: 'Paris', ghost: 'x' });
        expect(r.score).toBe(3.33);
        expect(r.perQuestion.map((p) => p.questionId)).toEqual(['1', '2', '3']);
    });

    it('an empty set scores 0 without dividing by zero', () => {
        expect(scoreAttempt([], {})).toMatchObject({ total: 0, correct: 0, score: 0 });
    });

    it('per-question result carries the correct answer and what was selected', () => {
        const r = scoreAttempt([q('1', 'Paris')], { 1: 'Rome' });
        expect(r.perQuestion[0]).toEqual({
            questionId: '1',
            selectedAnswer: 'Rome',
            correctAnswer: 'Paris',
            isCorrect: false,
        });
    });
});
