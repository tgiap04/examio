/** Server-side scoring. Pure: the answer key never leaves this file's callers' memory before submit. */
export interface ScoringQuestion {
    id: string;
    options: string[];
    answer: string;
}

export interface QuestionResult {
    questionId: string;
    selectedAnswer: string | null;
    correctAnswer: string;
    isCorrect: boolean;
}

export interface ScoreResult {
    total: number;
    correct: number;
    /** 0-10, two decimals. */
    score: number;
    perQuestion: QuestionResult[];
}

const LETTER = /^[A-Za-z]$/;
/** "A. ", "B) ", "<p>C: " in front of an option (editors paste them in). */
const OPTION_PREFIX = /^(<p>)?[A-Za-z][.):\s]+/;

const normalize = (value: string): string =>
    value.trim().replace(OPTION_PREFIX, '$1').trim().toLowerCase();

const letterIndex = (options: string[], value: string): number => {
    if (!LETTER.test(value)) return -1;
    const index = value.toUpperCase().charCodeAt(0) - 65;
    return index < options.length ? index : -1;
};

/**
 * Which option a value points at, or -1. Exact option text wins, then a letter,
 * then the text without its "A." style prefix, ignoring case. No fuzzy matching
 * and no default index: an unresolvable value is simply wrong.
 * `letterFirst` flips the first two: a stored single-letter key names a
 * position (A = first option) even if some option's text is that same letter.
 */
function optionIndexOf(options: string[], value: string, letterFirst = false): number {
    if (letterFirst) {
        const byLetter = letterIndex(options, value);
        if (byLetter !== -1) return byLetter;
    }
    const exact = options.findIndex((o) => o.trim() === value);
    if (exact !== -1) return exact;
    const byLetter = letterIndex(options, value);
    if (byLetter !== -1) return byLetter;
    const wanted = normalize(value);
    return wanted === '' ? -1 : options.findIndex((o) => normalize(o) === wanted);
}

export function isCorrectAnswer(
    question: Pick<ScoringQuestion, 'options' | 'answer'>,
    selected: unknown
): boolean {
    if (typeof selected !== 'string') return false;
    const picked = selected.trim();
    if (picked === '') return false;
    const key = question.answer.trim();
    // A single-letter key is a position: read the pick the same way (the page sends letters).
    const letterKey = letterIndex(question.options, key) !== -1;
    const keyIndex = optionIndexOf(question.options, key, letterKey);
    // A key that names no option (free text) can only match by its own text.
    if (keyIndex === -1) return normalize(picked) === normalize(key);
    return optionIndexOf(question.options, picked, letterKey) === keyIndex;
}

/** Only answers for questions that are in the set count; unanswered = wrong. */
export function scoreAttempt(
    questions: ScoringQuestion[],
    answers: Record<string, unknown>
): ScoreResult {
    const perQuestion = questions.map((q): QuestionResult => {
        const raw = answers[q.id];
        return {
            questionId: q.id,
            selectedAnswer: typeof raw === 'string' && raw.trim() !== '' ? raw : null,
            correctAnswer: q.answer,
            isCorrect: isCorrectAnswer(q, raw),
        };
    });
    const total = questions.length;
    const correct = perQuestion.filter((r) => r.isCorrect).length;
    const score = total === 0 ? 0 : Math.round((correct / total) * 1000) / 100;
    return { total, correct, score, perQuestion };
}
