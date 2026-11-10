import { rid, type ContentTestApp } from './content-test-app';

/** Fixtures for the content family. Every call creates fresh rows with unique ids. */
export async function seedQuizSet(
    t: ContentTestApp,
    ownerId: string,
    over: Record<string, unknown> = {}
) {
    const id = `qs_${rid()}`;
    await t.prisma.quizSet.create({
        data: { id, title: `quiz ${id}`, userId: ownerId, ...over } as never,
    });
    const q = await t.prisma.quizQuestion.create({
        data: {
            id: `qq_${rid()}`,
            question: 'Capital of France?',
            options: ['Paris', 'Rome'],
            answer: 'Paris',
        },
    });
    await t.prisma.detailsQuizQuestion.create({
        data: { quizSetId: id, quizQuestionId: q.id },
    });
    return { id, questionId: q.id };
}

export interface SeedQuestion {
    question: string;
    options?: string[];
    answer?: string;
    label?: string;
}

/** A quiz set with named labels and questions in creation order (what a snapshot reads). */
export async function seedQuizSetWithContent(
    t: ContentTestApp,
    ownerId: string,
    labels: string[],
    questions: SeedQuestion[]
) {
    const id = `qs_${rid()}`;
    await t.prisma.quizSet.create({ data: { id, title: `quiz ${id}`, userId: ownerId } });
    const labelIds = new Map<string, string>();
    for (const [order, name] of labels.entries()) {
        const label = await t.prisma.quizSetLabel.create({
            data: { id: `ql_${rid()}`, quizSetId: id, name, order, color: '#336699' },
        });
        labelIds.set(name, label.id);
    }
    const questionIds: string[] = [];
    for (const [i, q] of questions.entries()) {
        const row = await t.prisma.quizQuestion.create({
            data: {
                id: `qq_${rid()}`,
                question: q.question,
                options: q.options ?? ['a', 'b', 'c', 'd'],
                answer: q.answer ?? 'A',
                // distinct, increasing creation times: the owner-visible order is createdAt, then id
                createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
            },
        });
        questionIds.push(row.id);
        await t.prisma.detailsQuizQuestion.create({
            data: { quizSetId: id, quizQuestionId: row.id, labelId: q.label ? labelIds.get(q.label) : null },
        });
    }
    return { id, labelIds, questionIds };
}
