import { createHash } from 'crypto';

export interface HashLabel {
    id: string;
    name: string;
    order: number;
    color: string | null;
}

export interface HashQuestion {
    id: string;
    question: string;
    options: string[];
    answer: string;
    labelId: string | null;
    order: number;
}

/**
 * The ONE hash of a quiz set's content (labels + questions, as an exam sees them). `GetQuizSetSnapshot`
 * and `GetQuizSetsByIds(with_content_hash)` both call it, so equal content always yields an equal hash
 * and any edit a student would notice (text, options, answer key, label, order) changes it.
 *
 * Canonical form: fixed key order, labels by (order, id), questions in the order given (the snapshot
 * order). Titles and descriptions are deliberately outside the hash: they do not change an exam.
 */
export function computeContentHash(labels: readonly HashLabel[], questions: readonly HashQuestion[]): string {
    const canonicalLabels = [...labels]
        .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((l) => ({ id: l.id, name: l.name, order: l.order, color: l.color ?? null }));
    const canonicalQuestions = questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: [...q.options],
        answer: q.answer,
        labelId: q.labelId ?? null,
        order: q.order,
    }));
    return createHash('sha256')
        .update(JSON.stringify({ labels: canonicalLabels, questions: canonicalQuestions }))
        .digest('hex');
}
