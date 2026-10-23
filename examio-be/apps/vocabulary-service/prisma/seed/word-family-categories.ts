import type { PrismaClient } from '../../src/generated/prisma/client';

const categories = [
    {
        name: 'Mua sắm, nhà hàng',
        slug: 'shopping-restaurant',
        description: 'Vocabulary related to shopping, markets, and dining',
        imageUrl: null,
        order: 1,
    },
    {
        name: 'Giao thông, công trường',
        slug: 'traffic-construction',
        description: 'Words for transportation, roads, and construction',
        imageUrl: null,
        order: 2,
    },
    {
        name: 'Nơi làm việc, thời gian rảnh rỗi',
        slug: 'workplace-leisure',
        description: 'Workplace vocabulary and leisure activities',
        imageUrl: null,
        order: 3,
    },
    {
        name: 'Vị trí, chức danh',
        slug: 'position-title',
        description: 'Job titles, positions, and roles',
        imageUrl: null,
        order: 4,
    },
    {
        name: 'Địa điểm, vị trí',
        slug: 'location-place',
        description: 'Places, locations, and geographic terms',
        imageUrl: null,
        order: 5,
    },
    {
        name: 'Hội họp, công việc, văn phòng',
        slug: 'meeting-work-office',
        description: 'Meetings, office work, and business vocabulary',
        imageUrl: null,
        order: 6,
    },
    {
        name: 'Du lịch, giải trí',
        slug: 'travel-entertainment',
        description: 'Travel, tourism, and entertainment words',
        imageUrl: null,
        order: 7,
    },
    {
        name: 'Ngân hàng, bưu điện',
        slug: 'banking-post-office',
        description: 'Banking, finance, and postal services',
        imageUrl: null,
        order: 8,
    },
    {
        name: 'Thông báo, hướng dẫn, quảng cáo',
        slug: 'announcement-advertising',
        description: 'Public signs, instructions, and advertising',
        imageUrl: null,
        order: 9,
    },
    {
        name: 'Tin tức, phát thanh, du lịch',
        slug: 'news-broadcasting-travel',
        description: 'News, broadcasting, and travel journalism',
        imageUrl: null,
        order: 10,
    },
];

export async function seedWordFamilyCategories(prisma: PrismaClient) {
    console.log('🌱 Seeding Word Family Categories...\n');

    let count = 0;

    for (const cat of categories) {
        await prisma.wordFamilyCategory.upsert({
            where: { slug: cat.slug },
            update: {
                name: cat.name,
                description: cat.description,
                imageUrl: cat.imageUrl,
                order: cat.order,
            },
            create: {
                name: cat.name,
                slug: cat.slug,
                description: cat.description,
                imageUrl: cat.imageUrl,
                order: cat.order,
            },
        });

        count++;
        console.log(`✅ [${count}/10] ${cat.name} (${cat.slug})`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🎉 Word Family Categories seeded: ${count}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
