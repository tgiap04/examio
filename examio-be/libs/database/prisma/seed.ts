import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    // 0. Seed Page Feature Flags (trang bật/tắt cho user — global).
    // Chạy đầu tiên để độc lập với các seed khác. Upsert giữ nguyên `enabled`
    // mà admin đã chỉnh; chỉ đồng bộ lại `label`.
    const pageFlags = [
        { key: 'ai-tool', label: 'Công cụ AI' },
        { key: 'word-family', label: 'Từ vựng tiếng Anh' },
        { key: 'my-materials', label: 'Tài liệu của tôi' },
        { key: 'my-exams', label: 'Bài thi của tôi' },
        { key: 'manage-exam', label: 'Quản lý Đề thi' },
        { key: 'flash-card', label: 'Quản lý Flashcard' },
        { key: 'manage-exam-room', label: 'Quản lý Phòng thi' },
        { key: 'history', label: 'Lịch sử' },
    ];
    for (const flag of pageFlags) {
        const saved = await prisma.pageFeatureFlag.upsert({
            where: { key: flag.key },
            update: { label: flag.label },
            create: { key: flag.key, label: flag.label, enabled: true },
        });
        console.log(`✅ Upserted PageFeatureFlag: ${saved.key}`);
    }

    // 1. Seed Subject Categories (Danh mục môn học)
    // Upsert categories to avoid duplicates
    const categories = [
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

    for (const cat of categories) {
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

        console.log(`✅ Upserted Category: ${category.name}`);

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
            console.log(`   - Upserted Subject: ${subject.name}`);
            subjectOrder++;
        }
    }

    // 2. Seed Word Family Categories
    const { seedWordFamilyCategories } = await import('../src/seed/word-family-category.seed');
    await seedWordFamilyCategories(prisma);

    console.log('🌱 Seed completed successfully.');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
