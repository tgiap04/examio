# Flashcard Module Pattern Report (examio-be)

## 1. Module Structure
```ts
@Module({
    imports: [AuthModule, GrpcClientsModule.registerR2Client()],
    providers: [PrismaService, RedisService, FlashcardsetService, GenerateIdService,
                R2ClientService, FlashCardSetRepository, TurnstileService],
    controllers: [FlashcardsetController],
    exports: [FlashcardsetService, FlashCardSetRepository],
})
export class FlashcardSetModule {}
```
- RedisModule is `@Global()` so RedisService is a direct provider, not an imported module
- Service + Repository both exported (used by other modules)

## 2. Controller Pattern
```ts
@ApiTags('Flashcardsets') @ApiExtraModels(CreateFlashcardsetDto, ...)
@Controller('flashcardsets') export class FlashcardsetController {
    @Post() @UseGuards(AuthGuard) @UseInterceptors(FileInterceptor('thumbnail'))
    @ApiCookieAuth('cookie-auth')
    async create(@Req() req: AuthenticatedRequest, @UploadedFile() thumbnail?: Express.Multer.File) {
        // Manually parse form-data fields from req.body (not @Body())
        const dto = { title: req.body.title, tags: JSON.parse(req.body.tags), ... };
        return this.service.create(req.user, dto, thumbnail);
    }
}
```
- Guards: `AuthGuard` (always auth) / `OptionalAuthGuard` (guest OK, use `req.user?.id`)
- `AuthenticatedRequest` from `@examio/common`; `req.user.id` always set with `AuthGuard`
- Multipart form-data: parse `req.body` manually; `@Body()` does NOT work with `FileInterceptor`
- Swagger: `@ApiOperation`, `@ApiResponse(type=...)`, `@ApiParam`, `@ApiCookieAuth`
- Response: service returns plain object `{ message, ...data }`, NestJS serializes directly

## 3. Service Pattern
```ts
@Injectable() export class FlashcardsetService {
    constructor(private readonly prisma: PrismaService,
                private readonly flashcardSetRepository: FlashCardSetRepository,
                private readonly generateIdService: GenerateIdService,
                private readonly r2Service: R2ClientService) {}
}
```
- Exceptions: `NotFoundException`, `BadRequestException`, `ForbiddenException`, `ConflictException`, `InternalServerErrorException` (messages in Vietnamese)
- Response: `{ message: '...', flashcardSet: {...} }` or `{ flashCards, pagination: { page, limit, total, totalPages } }`
- DB field `tag` -> API `tags`: `const { tag, ...rest } = fs; return { ...rest, tags: tag };`
- Transactions: `await this.prisma.$transaction(async (tx) => { ... })`

## 4. Repository / Prisma Pattern
```ts
@Injectable() export class FlashCardSetRepository extends BaseRepository<FlashCardSet> {
    protected modelName = 'flashCardSet';
    protected cachePrefix = 'flashcardset';
    protected defaultCacheTTL = EXPIRED_TIME.FIVE_MINUTES;
}
```
- Extends `BaseRepository` from `@examio/common`; model via `this.model`
- BaseRepository methods: `findOne({ where, include, cache })`, `findAll({ where, cache, cacheTTL })`, `paginate({ page, size, ...filters, cache }, userId)`, `create/update/delete(id, data, userId)`
- Cache invalidation: automatic on BaseRepository CRUD; manual via `invalidateUserListCache(userId)`, `invalidateItemCache(userId, id)`, `invalidateCache()`
- Service also uses `this.prisma.flashCardSet.*` directly for custom queries, aggregations, view history

## 5. Redis Caching Pattern
```ts
// Read-through
const cacheKey = this.getUserScopedCacheKey(userId) + ':list';
const cached = await this.redis.get<FlashCardSet[]>(cacheKey);
if (cached) return cached;
const data = await this.model.findMany(...);
await this.redis.set(cacheKey, data, cacheTTL);
// Invalidation
await this.flashcardSetRepository.invalidateUserListCache(userId);
await this.flashcardSetRepository.invalidateItemCache(userId, id);
```
- Key patterns: `{module}:user:{userId}:list:*`, `{module}:user:{userId}:item:{id}:*`, `{module}:public:{id}:*`
- TTL: `EXPIRED_TIME.FIVE_MINUTES = 300s`, `EXPIRED_TIME.TEN_MINUTES = 600s`
- RedisService: `get<T>()`, `set(key, data, ttl)`, `del(key)`, `delPattern(pattern)` (wildcard)

## 6. DTO Pattern
```ts
export const CreateFlashcardsetSchema = z.object({
    title: z.string().min(1), isPublic: z.boolean().optional().default(false),
    tags: z.array(z.string()).optional().default([]), thumbnail: z.string().url().optional(),
});
export class CreateFlashcardsetDto extends createZodDto(CreateFlashcardsetSchema) {
    @ApiProperty({ description: '...', example: 'Basic Vocabulary' }) title: string;
}
```
- Zod for validation + `createZodDto` (nestjs-zod) for class + Swagger; `@ApiProperty` for extra docs
- Response DTOs: plain TypeScript classes with `@ApiProperty` (no Zod)
- Optional booleans: `z.boolean().optional().default(false)`

## 7. Auth Guards
```ts
import { AuthGuard, OptionalAuthGuard, AuthenticatedRequest } from '@examio/common';
@UseGuards(AuthGuard)       // requires login
@UseGuards(OptionalAuthGuard)  // allows guest
```
- No `AdminGuard` in this module; ownership checked in service via `findOne({ where: { id, userId } })`

## 8. Key Import Paths
| Item | From |
|---|---|
| `PrismaService` | `@examio/database` |
| `RedisService`, `EXPIRED_TIME` | `@examio/redis` |
| `BaseRepository`, `GenerateIdService`, `AuthGuard`, `OptionalAuthGuard`, `AuthenticatedRequest`, `R2ClientService`, `TurnstileService`, `sanitizeFilename`, `AuthModule` | `@examio/common` |
| `GrpcClientsModule.registerR2Client()` | `@examio/common` |

## 9. Conventions
- Files: `xxx.module.ts`, `xxx.controller.ts`, `xxx.service.ts`, `xxx.repository.ts`; DTOs in `dto/` subdir
- No barrel `index.ts` in modules directory
- Field rename `tag` (DB) -> `tags` (API) via destructuring at response boundary
- Cache invalidation automatic on BaseRepository CRUD; manual for bulk/custom ops
