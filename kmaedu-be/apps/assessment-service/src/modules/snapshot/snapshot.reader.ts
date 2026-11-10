import { BadRequestException } from '@nestjs/common';
import { QUESTION_SELECTION_MODE, type LabelQuestionConfig } from '../../types';
import type { QuizSnapshotV1, SnapshotQuestion } from './quiz-snapshot';

/** `labelId` used in a label config for the questions that carry no label. */
export const UNLABELED = 'unlabeled';

type Random = () => number;

/** Fisher-Yates on a copy (the old `sort(() => Math.random() - 0.5)` is biased). */
export function shuffled<T>(items: readonly T[], random: Random = Math.random): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export interface SelectionConfig {
    mode: number;
    questionCount: number | null;
    labelConfig: LabelQuestionConfig[] | null;
    shuffle: boolean;
}

/**
 * The question ids of one attempt, chosen ONLY from the snapshot: ALL, RANDOM_TOTAL (N of all) or
 * RANDOM_BY_LABEL (N per label, `unlabeled` for the unlabeled ones), optionally in shuffled order.
 */
export function selectQuestionIds(
    snapshot: QuizSnapshotV1,
    config: SelectionConfig,
    random: Random = Math.random
): string[] {
    const ids = pickQuestions(snapshot.questions, config, random).map((q) => q.id);
    return config.shuffle ? shuffled(ids, random) : ids;
}

/** The questions the selection mode draws; every question when the mode's own setting is missing. */
function pickQuestions(all: SnapshotQuestion[], config: SelectionConfig, random: Random): SnapshotQuestion[] {
    const { mode, questionCount, labelConfig } = config;
    if (mode === QUESTION_SELECTION_MODE.RANDOM_TOTAL && questionCount && questionCount > 0) {
        return shuffled(all, random).slice(0, questionCount);
    }
    if (mode === QUESTION_SELECTION_MODE.RANDOM_BY_LABEL && labelConfig && labelConfig.length > 0) {
        return labelConfig.flatMap((c) => {
            const labelId = c.labelId === UNLABELED ? null : c.labelId;
            return shuffled(
                all.filter((q) => q.labelId === labelId),
                random
            ).slice(0, c.count);
        });
    }
    return [...all];
}

/** The questions of an attempt in the order of `selectedIds` (all questions when the attempt stored none). */
export function questionsOf(snapshot: QuizSnapshotV1, selectedIds: readonly string[]): SnapshotQuestion[] {
    if (selectedIds.length === 0) return snapshot.questions;
    const byId = new Map(snapshot.questions.map((q) => [q.id, q]));
    return selectedIds.flatMap((id) => {
        const q = byId.get(id);
        return q ? [q] : [];
    });
}

/** A question as a student sees it before the attempt is graded: no answer key. */
export function withoutAnswer(q: SnapshotQuestion): { id: string; question: string; options: string[] } {
    return { id: q.id, question: q.question, options: q.options };
}

/** A question with its answer key, for hosts and for a graded attempt of a session that shows answers. */
export function withAnswer(q: SnapshotQuestion): { id: string; question: string; options: string[]; answer: string } {
    return { id: q.id, question: q.question, options: q.options, answer: q.answer };
}

/** Number of `answers` (questionId -> chosen letter) that match the snapshot's answer letters. */
export function countCorrect(questions: readonly SnapshotQuestion[], answers: Record<string, string>): number {
    return questions.reduce((n, q) => (answers[q.id] === q.answer ? n + 1 : n), 0);
}

export interface LabelStats {
    totalQuestions: number;
    labels: Array<{ id: string; name: string; color: string | null; questionCount: number }>;
    unlabeledCount: number;
}

/** Label breakdown of the snapshot (`available-labels`). Labels in `order`, unlabeled counted apart. */
export function labelStats(snapshot: QuizSnapshotV1): LabelStats {
    const counts = new Map<string, number>();
    let unlabeledCount = 0;
    for (const q of snapshot.questions) {
        if (q.labelId === null) unlabeledCount++;
        else counts.set(q.labelId, (counts.get(q.labelId) ?? 0) + 1);
    }
    return {
        totalQuestions: snapshot.questions.length,
        labels: [...snapshot.labels]
            .sort((a, b) => a.order - b.order)
            .map((l) => ({ id: l.id, name: l.name, color: l.color ?? null, questionCount: counts.get(l.id) ?? 0 })),
        unlabeledCount,
    };
}

/** Rejects a selection config the snapshot cannot satisfy (create, PUT and refresh run it against the session's own snapshot). */
export function validateSelectionConfig(snapshot: QuizSnapshotV1, config: Omit<SelectionConfig, 'shuffle'>): void {
    const stats = labelStats(snapshot);
    const total = stats.totalQuestions;
    const mode = config.mode ?? QUESTION_SELECTION_MODE.ALL;
    if (mode === QUESTION_SELECTION_MODE.RANDOM_TOTAL) {
        if (!config.questionCount || config.questionCount <= 0) {
            throw new BadRequestException('Phải chỉ định số câu hỏi khi sử dụng chế độ random từ tổng số câu');
        }
        if (config.questionCount > total) {
            throw new BadRequestException(
                `Số câu hỏi (${config.questionCount}) không được vượt quá tổng số câu trong bộ đề (${total})`
            );
        }
    }
    if (mode !== QUESTION_SELECTION_MODE.RANDOM_BY_LABEL) return;

    const labelConfig = config.labelConfig;
    if (!labelConfig || labelConfig.length === 0) {
        throw new BadRequestException('Phải cấu hình số câu cho từng nhãn khi sử dụng chế độ random theo nhãn');
    }
    const available = new Map<string, number>(stats.labels.map((l) => [l.id, l.questionCount]));
    available.set(UNLABELED, stats.unlabeledCount);
    const used = new Set<string>();
    let configured = 0;
    for (const c of labelConfig) {
        if (used.has(c.labelId)) {
            throw new BadRequestException(`Nhãn "${c.labelId}" được cấu hình nhiều lần`);
        }
        used.add(c.labelId);
        const have = available.get(c.labelId);
        if (have === undefined) {
            throw new BadRequestException(`Nhãn với ID "${c.labelId}" không tồn tại trong bộ đề`);
        }
        if (c.count > have) {
            const name =
                c.labelId === UNLABELED
                    ? 'Chưa gán nhãn'
                    : (stats.labels.find((l) => l.id === c.labelId)?.name ?? c.labelId);
            throw new BadRequestException(`Số câu yêu cầu cho nhãn "${name}" (${c.count}) vượt quá số câu có sẵn (${have})`);
        }
        configured += c.count;
    }
    if (config.questionCount !== null && config.questionCount !== undefined && configured !== config.questionCount) {
        throw new BadRequestException(
            `Tổng số câu cấu hình theo nhãn (${configured}) phải bằng tổng số câu của phiên thi (${config.questionCount})`
        );
    }
    if (configured > total) {
        throw new BadRequestException(`Tổng số câu cấu hình (${configured}) vượt quá số câu có sẵn (${total})`);
    }
}
