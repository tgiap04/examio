/**
 * ai-chat-service reference data: subject categories + subjects (AI teachers).
 * Idempotent upserts keyed by slug.
 */
import type { PrismaClient } from '../../src/generated/prisma/client';

export const SUBJECT_CATEGORIES = [
    {
        name: 'Khoa học Tự nhiên',
        slug: 'natural-sciences',
        icon: 'atom',
        color: 'blue',
        order: 1,
        subjects: [
            {
                name: 'Toán học',
                slug: 'mathematics',
                icon: 'calculator',
                color: 'blue',
                description: 'Đại số, Hình học, Giải tích...',
            },
            {
                name: 'Vật lý',
                slug: 'physics',
                icon: 'bolt',
                color: 'yellow',
                description: 'Cơ học, Điện từ, Quang học...',
            },
            {
                name: 'Hóa học',
                slug: 'chemistry',
                icon: 'flask',
                color: 'green',
                description: 'Hóa vô cơ, Hóa hữu cơ...',
            },
            {
                name: 'Sinh học',
                slug: 'biology',
                icon: 'dna',
                color: 'emerald',
                description: 'Di truyền, Sinh thái...',
            },
        ],
    },
    {
        name: 'Khoa học Xã hội',
        slug: 'social-sciences',
        icon: 'users',
        color: 'red',
        order: 2,
        subjects: [
            {
                name: 'Ngữ văn',
                slug: 'literature',
                icon: 'book-open',
                color: 'orange',
                description: 'Văn học, Tiếng Việt...',
            },
            {
                name: 'Lịch sử',
                slug: 'history',
                icon: 'hourglass',
                color: 'amber',
                description: 'Lịch sử Việt Nam, Thế giới...',
            },
            {
                name: 'Địa lý',
                slug: 'geography',
                icon: 'globe',
                color: 'cyan',
                description: 'Địa lý tự nhiên, Kinh tế...',
            },
            {
                name: 'GDCD',
                slug: 'civic-education',
                icon: 'scale',
                color: 'red',
                description: 'Giáo dục công dân...',
            },
        ],
    },
    {
        name: 'Ngoại ngữ',
        slug: 'foreign-languages',
        icon: 'languages',
        color: 'purple',
        order: 3,
        subjects: [
            {
                name: 'Tiếng Anh',
                slug: 'english',
                icon: 'us',
                color: 'blue',
                description: 'Grammar, Vocabulary, Reading...',
            },
            {
                name: 'Tiếng Nhật',
                slug: 'japanese',
                icon: 'jp',
                color: 'red',
                description: 'N5, N4, N3...',
            },
            {
                name: 'Tiếng Trung',
                slug: 'chinese',
                icon: 'cn',
                color: 'yellow',
                description: 'HSK 1-6...',
            },
            {
                name: 'Tiếng Hàn',
                slug: 'korean',
                icon: 'kr',
                color: 'indigo',
                description: 'Topik...',
            },
        ],
    },
    {
        name: 'Công nghệ thông tin',
        slug: 'information-technology',
        icon: 'cpu',
        color: 'slate',
        order: 4,
        subjects: [
            {
                name: 'Lập trình',
                slug: 'programming',
                icon: 'code',
                color: 'slate',
                description: 'C++, Java, Python...',
            },
            {
                name: 'Cấu trúc dữ liệu',
                slug: 'data-structures',
                icon: 'database',
                color: 'slate',
                description: 'Sort, Search, Tree...',
            },
            {
                name: 'Mạng máy tính',
                slug: 'networking',
                icon: 'network',
                color: 'slate',
                description: 'TCP/IP, OSI...',
            },
        ],
    },
];

export async function seedSubjects(prisma: PrismaClient): Promise<{ categories: number; subjects: number }> {
    let subjects = 0;
    for (const cat of SUBJECT_CATEGORIES) {
        // Upsert Category
        const category = await prisma.subjectCategory.upsert({
            where: { slug: cat.slug },
            update: {
                name: cat.name,
                icon: cat.icon,
                color: cat.color,
                order: cat.order,
            },
            create: {
                name: cat.name,
                slug: cat.slug,
                icon: cat.icon,
                color: cat.color,
                order: cat.order,
                isActive: true,
            },
        });

        
        // Upsert Subjects for this Category
        let subjectOrder = 1;
        for (const sub of cat.subjects) {
            const subject = await prisma.subject.upsert({
                where: { slug: sub.slug },
                update: {
                    name: sub.name,
                    icon: sub.icon,
                    color: sub.color,
                    description: sub.description,
                    categoryId: category.id,
                    order: subjectOrder,
                },
                create: {
                    name: sub.name,
                    slug: sub.slug,
                    icon: sub.icon,
                    color: sub.color,
                    description: sub.description,
                    categoryId: category.id,
                    order: subjectOrder,
                    isActive: true,
                    // Default system prompt (can be updated later)
                    systemPrompt: `Bạn là một chuyên gia về môn ${sub.name}. Hãy giúp người dùng giải đáp các thắc mắc và tạo bài tập liên quan đến môn học này.`,
                },
            });
            subjects++;
            subjectOrder++;
        }
    }
    return { categories: SUBJECT_CATEGORIES.length, subjects };
}
