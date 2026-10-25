import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AuthServiceModule } from '../../apps/auth-service/src/auth-service.module';
import { ExamServiceModule } from '../../apps/exam-service/src/exam-service.module';
import { StudyRoomServiceModule } from '../../apps/study-room-service/src/study-room-service.module';
import { VocabularyServiceModule } from '../../apps/vocabulary-service/src/vocabulary-service.module';
import { DocumentServiceModule } from '../../apps/document-service/src/document-service.module';
import { AIChatServiceModule } from '../../apps/ai-chat-service/src/ai-chat-service.module';
import { FinanceServiceModule } from '../../apps/finance-service/src/finance-service.module';
import { AdminServiceModule } from '../../apps/admin-service/src/admin-service.module';
import { R2ServiceModule } from '../../apps/r2-service/src/r2-service.module';
import {
    AUTHENTICATED_ALLOWLIST,
    WS_DOCUMENTED,
} from './authenticated-allowlist';
import { scanService, type HttpHandler } from './handler-scan';

const ROOT = join(__dirname, '..', '..');

const services = {
    auth: scanService(AuthServiceModule),
    exam: scanService(ExamServiceModule),
    studyRoom: scanService(StudyRoomServiceModule),
    vocabulary: scanService(VocabularyServiceModule),
    document: scanService(DocumentServiceModule),
    aiChat: scanService(AIChatServiceModule),
    finance: scanService(FinanceServiceModule),
    admin: scanService(AdminServiceModule),
    r2: scanService(R2ServiceModule),
};
const all: HttpHandler[] = Object.values(services).flatMap((s) => s.http);
const byKey = new Map(all.map((h) => [h.key, h]));

describe('authz declarations (deny by default, RT-5 / RT-6 / RT-7)', () => {
    it('scans every service and finds their handlers', () => {
        expect(services.exam.http.length).toBeGreaterThan(110);
        expect(services.studyRoom.http.length).toBeGreaterThanOrEqual(10);
        expect(services.vocabulary.http.length).toBeGreaterThanOrEqual(10);
        expect(services.document.http.length).toBeGreaterThanOrEqual(7);
        // 16 chat routes + 4 public subject routes
        expect(services.aiChat.http.length).toBeGreaterThanOrEqual(20);
        expect(services.auth.http.length).toBeGreaterThan(20);
        expect(services.finance.http.length).toBeGreaterThan(5);
        expect(services.admin.http.length).toBeGreaterThan(20);
        expect(services.r2.http.length).toBeGreaterThan(0);
    });

    describe.each(Object.entries(services))(
        '%s-service HTTP handlers',
        (_name, scan) => {
            it('every handler declares Public / Authenticated / RequireOwnerOrPermission / RequirePermissions', () => {
                const undeclared = scan.http
                    .filter((h) => !h.declaration)
                    .map((h) => `${h.method} ${h.route} (${h.key})`);
                expect(undeclared).toEqual([]);
            });
        }
    );

    describe('WebSocket gateways', () => {
        const gateways = Object.entries(services).flatMap(([svc, s]) =>
            s.gateways.map((g) => ({ svc, ...g }))
        );

        it('finds the study-room gateway with its @SubscribeMessage handlers', () => {
            const g = gateways.find((x) => x.name === 'StudyRoomGateway');
            expect(g).toBeDefined();
            expect(g!.messages.length).toBeGreaterThanOrEqual(27);
        });

        it('every gateway class is declared @Authenticated() (or documented with a reason)', () => {
            const bad = gateways
                .filter(
                    (g) =>
                        g.classDeclaration?.kind !== 'authenticated' &&
                        !WS_DOCUMENTED[g.name]
                )
                .map((g) => g.name);
            expect(bad).toEqual([]);
            for (const [name, reason] of Object.entries(WS_DOCUMENTED)) {
                expect(reason.length).toBeGreaterThan(10);
                expect(gateways.map((g) => g.name)).toContain(name);
            }
        });
    });

    describe('plain @Authenticated() / @RequireOwnerOrPermission handlers', () => {
        const needsProof = all.filter(
            (h) =>
                h.declaration?.kind === 'authenticated' || h.ownerOrPermission
        );
        const listed = new Set(AUTHENTICATED_ALLOWLIST.map((e) => e.key));

        it('each one is on the AUTHENTICATED_ALLOWLIST', () => {
            const missing = needsProof
                .filter((h) => !listed.has(h.key))
                .map((h) => `${h.method} ${h.route} (${h.key})`);
            expect(missing).toEqual([]);
        });

        it('no allowlist entry is stale or duplicated', () => {
            const need = new Set(needsProof.map((h) => h.key));
            expect([...listed].filter((k) => !need.has(k))).toEqual([]);
            expect(listed.size).toBe(AUTHENTICATED_ALLOWLIST.length);
        });

        it.each(AUTHENTICATED_ALLOWLIST.map((e) => [e.key, e] as const))(
            '%s links a two-user negative spec or is self-scoped',
            (_key, entry) => {
                const handler = byKey.get(entry.key);
                expect(handler).toBeDefined();
                if (entry.selfScoped) {
                    // a route with a path parameter can address someone else's data
                    expect(handler!.route).not.toContain(':');
                    return;
                }
                expect(entry.spec).toBeTruthy();
                const file = join(ROOT, entry.spec!);
                expect(existsSync(file)).toBe(true);
                const titles = [
                    ...readFileSync(file, 'utf8').matchAll(
                        /\b(?:it|test)(?:\.each\([^)]*\))?\(\s*[`'"]([^`'"]*)[`'"]/g
                    ),
                ].map((m) => m[1]);
                // describe.each + it titles carry the key either directly or via the describe name
                const text = readFileSync(file, 'utf8');
                const mentions =
                    titles.some((t) => t.includes(entry.key)) ||
                    text.includes(`'${entry.key}`) ||
                    text.includes(`\`${entry.key}`);
                expect(mentions).toBe(true);
            }
        );
    });
});
