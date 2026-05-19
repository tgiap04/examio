---
type: report
created: 2026-05-19
scope: backend flashcard study endpoints
---

# Flashcard Study Backend Survey

## Summary

- `/student/recent-flashcards` is implemented in gateway as a proxy and in exam-service as the real controller/service.
- `getRecentFlashcards()` currently fetches accessible `FlashCardSet` rows ordered by `updatedAt desc`; it does not use `FlashCardViewHistory` and sets `progress: undefined`.
- Gateway defines `/flashcard-study/*` proxy routes, but no matching `flashcard-study` controller/service/module exists in `apps/exam-service/src`.
- `FlashCardViewHistory` is only created when flashcard sets/cards are viewed; no backend reads it for recents.
- Prisma has `FlashCardViewHistory` and `UserPinnedFlashcard`; no flashcard study session/progress model was found.

## Findings

### Student recent flashcards endpoint

`examio-be/apps/gateway-service/src/controllers/student-proxy.controller.ts`

```ts
12:     @Get('recent-flashcards')
16:     async getRecentFlashcards(@Req() req: Request, @Query() query: any) {
17:         return this.proxyService.forwardWithAuth(
18:             'exam',
19:             {
20:                 method: 'GET',
21:                 path: '/api/v1/student/recent-flashcards',
22:                 query,
23:                 headers: this.h(req),
24:             },
25:             this.t(req)
26:         );
27:     }
```

`examio-be/apps/exam-service/src/modules/student/student.controller.ts`

```ts
12:     @Get('recent-flashcards')
13:     @UseGuards(AuthGuard)
17:     async getRecentFlashcards(
18:         @Req() req: AuthenticatedRequest,
19:         @Query('limit') limit?: string,
20:         @Query('page') page?: string
21:     ) {
22:         const parsedLimit = limit ? parseInt(limit, 10) : 10;
23:         const parsedPage = page ? parseInt(page, 10) : 1;
24:         return this.studentService.getRecentFlashcards(req.user.id, parsedLimit, parsedPage);
25:     }
```

`examio-be/apps/exam-service/src/modules/student/student.service.ts`

```ts
8:     async getRecentFlashcards(userId: string, limit: number, page: number) {
11:         const where = {
12:             OR: [
13:                 { isPublic: true },
14:                 { userId: userId },
15:                 { whitelist: { has: userId } },
16:             ],
17:         };
19:         const [flashcardSets, total] = await Promise.all([
20:             this.prisma.flashCardSet.findMany({
21:                 where,
22:                 include: {
31:                     detailsFlashCard: { select: { id: true } },
34:                     userPins: {
35:                         where: { userId },
36:                         select: { pinnedAt: true },
37:                     },
38:                 },
39:                 orderBy: [
40:                     { updatedAt: 'desc' },
41:                 ],
42:                 skip,
43:                 take: limit,
44:             }),
45:             this.prisma.flashCardSet.count({ where }),
46:         ]);
48:         const formattedSets = flashcardSets.map((set) => ({
55:             lastViewedAt: set.updatedAt.toISOString(),
64:             isPinned: set.userPins.length > 0,
65:             progress: undefined,
66:         }));
68:         // Sort: pinned first (by pinnedAt desc), then non-pinned
```

Progress calculation: none. The returned `progress` is explicitly `undefined`. `lastViewedAt` is `updatedAt`, not `FlashCardViewHistory.viewedAt`.

Module registration:

`examio-be/apps/exam-service/src/modules/student/student.module.ts`

```ts
7: @Module({
8:     imports: [DatabaseModule, AuthModule],
9:     controllers: [StudentController],
10:     providers: [StudentService],
11:     exports: [StudentService],
12: })
```

`examio-be/apps/exam-service/src/exam-service.module.ts`

```ts
25: import { StudentModule } from './modules/student/student.module';
44:         StudentModule,
```

### Flashcard-study backend module

Search result: no backend `flashcard-study` module/controller/service files were found under `examio-be/apps/exam-service/src`. A route search for `@Controller('flashcard-study')` in exam-service returned no matches.

### Gateway `/flashcard-study/*` proxy routes

`examio-be/apps/gateway-service/src/controllers/ai-study-proxy.controller.ts`

```ts
1029: @ApiTags('Flashcard Study')
1030: @Controller('flashcard-study')
1032: export class FlashcardStudyProxyController {
1035:     @Post('session')
1042:                 path: '/api/v1/flashcard-study/session',
1050:     @Post('session/:sessionId')
1061:                 path: `/api/v1/flashcard-study/session/${sessionId}`,
1069:     @Post('session/:sessionId/complete')
1080:                 path: `/api/v1/flashcard-study/session/${sessionId}/complete`,
1088:     @Post('session/:sessionId/review')
1099:                 path: `/api/v1/flashcard-study/session/${sessionId}/review`,
1107:     @Get('cards/:flashCardSetId')
1118:                 path: `/api/v1/flashcard-study/cards/${flashCardSetId}`,
1126:     @Get('history/:flashCardSetId')
1136:                 path: `/api/v1/flashcard-study/history/${flashCardSetId}`,
1143:     @Get('progress/:flashCardSetId')
1153:                 path: `/api/v1/flashcard-study/progress/${flashCardSetId}`,
```

`examio-be/apps/gateway-service/src/gateway.module.ts`

```ts
31: import {
34:     FlashcardStudyProxyController,
37: } from './controllers/ai-study-proxy.controller';
77:         // AI & Study
80:         FlashcardStudyProxyController,
```

### FlashCardViewHistory model usage

Only create usages were found in `examio-be/apps/exam-service/src/modules/flashcardset/flashcardset.service.ts`; no `findMany`, `count`, `groupBy`, or progress calculations were found.

Cards page access creates a history row:

```ts
212:         // Track usage if first page is accessed
213:         if (pageNum === 1 && user.id) {
214:             await this.prisma.flashCardViewHistory
215:                 .create({
216:                     data: {
217:                         id: this.generateIdService.generateId(),
218:                         userId: user.id,
219:                         flashCardSetId: id,
220:                     },
221:                 })
222:                 .catch(() => {});
223:         }
```

Public flashcard set access creates a history row:

```ts
276:         // Track usage if userId is provided
277:         if (userId) {
278:             await this.prisma.flashCardViewHistory
279:                 .create({
280:                     data: {
281:                         id: this.generateIdService.generateId(),
282:                         userId: userId,
283:                         flashCardSetId: id,
284:                     },
285:                 })
286:                 .catch(() => {});
287:         }
```

Flashcard set detail access creates a history row:

```ts
1155:         // Record view history if userId is provided
1156:         if (userId) {
1157:             await this.prisma.flashCardViewHistory
1158:                 .create({
1159:                     data: {
1160:                         id: this.generateIdService.generateId(),
1161:                         userId: userId,
1162:                         flashCardSetId: id,
1163:                     },
1164:                 })
```

Flashcard set with access code creates a history row:

```ts
1219:         // Record view history if userId is provided
1220:         if (userId) {
1221:             await this.prisma.flashCardViewHistory
1222:                 .create({
1223:                     data: {
1224:                         id: this.generateIdService.generateId(),
1225:                         userId: userId,
1226:                         flashCardSetId: id,
1227:                     },
1228:                 })
```

### Prisma flashcard history/progress schema

`examio-be/libs/database/src/schema.prisma`

```prisma
121: model FlashCardSet {
138:     user             User               @relation(fields: [userId], references: [id], onDelete: Cascade)
139:     detailsFlashCard DetailsFlashCard[]
140:     labels           FlashCardSetLabel[]
141:     viewHistories    FlashCardViewHistory[]
142:     userPins         UserPinnedFlashcard[]
```

```prisma
367: model FlashCardViewHistory {
368:     id             String   @id @default(cuid())
369:     userId         String
370:     flashCardSetId String
371:     viewedAt       DateTime @default(now())
372:     createdAt      DateTime @default(now())
373:     updatedAt      DateTime @default(now()) @updatedAt
375:     user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
376:     flashCardSet FlashCardSet @relation(fields: [flashCardSetId], references: [id], onDelete: Cascade)
378:     @@index([userId, viewedAt])
379:     @@index([flashCardSetId])
380: }
```

```prisma
601:     flashCardViewHistories    FlashCardViewHistory[]
602:     pinnedFlashcards          UserPinnedFlashcard[]
```

Additional generated/split schema copies contain the same model:

- `examio-be/libs/database/src/models/exam.prisma`
- `examio-be/libs/database/prisma/models/exam.prisma`

Search for `FlashCard.*Session`, `StudySession`, `FlashcardStudy`, and flashcard `progress` in Prisma found no flashcard study session/progress models.

## Recommendations

- If `/student/recent-flashcards` should mean recently viewed, change it to read from `FlashCardViewHistory` grouped/distinct by `flashCardSetId`, ordered by `viewedAt desc`.
- If dashboard cards need study progress, add a persisted progress/session model or implement `/flashcard-study/progress/:flashCardSetId` in exam-service before wiring the gateway routes.
- Avoid exposing gateway `/flashcard-study/*` routes until the exam-service backing endpoints exist, or clients will receive downstream 404s.

## Unresolved Questions

- Should recents be access-based (`FlashCardSet.updatedAt`) or user-history-based (`FlashCardViewHistory.viewedAt`)?
- What should `progress` represent: viewed cards, reviewed cards, mastered cards, or completed sessions?
