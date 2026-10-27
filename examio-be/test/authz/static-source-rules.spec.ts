import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { authzVersionKey as gatewayKey } from '../../apps/gateway-service/src/pipeline/auth-state.service';
import { authzVersionKey as studyRoomKey } from '../../apps/study-room-service/src/modules/study-room/study-room-socket-auth.service';

const ROOT = join(__dirname, '..', '..');

function sourceFiles(dir: string, into: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) sourceFiles(full, into);
        else if (
            name.endsWith('.ts') &&
            !name.endsWith('.spec.ts') &&
            !name.endsWith('e2e-spec.ts')
        )
            into.push(full);
    }
    return into;
}

// content-service and assessment-service (formerly the exam service, phase 14): both are scanned.
const examSrc = [
    ...sourceFiles(join(ROOT, 'apps/assessment-service/src')),
    ...sourceFiles(join(ROOT, 'apps/content-service/src')),
];
const read = (f: string) => readFileSync(f, 'utf8');

describe('static security rules (phase 06)', () => {
    it('assessment-service and content-service have no @Throttle (it has no ThrottlerModule, so it would be a silent no-op)', () => {
        const offenders = examSrc.filter((f) => /@Throttle\b/.test(read(f)));
        expect(offenders).toEqual([]);
    });

    it('no plain-compare of an access code remains in assessment-service or content-service', () => {
        const offenders = examSrc.filter((f) =>
            /accessCode\?\.toString\(\) !==|providedCode ===/.test(read(f))
        );
        expect(offenders).toEqual([]);
    });

    it('every access-code comparison goes through the shared guard', () => {
        for (const f of [
            'apps/content-service/src/modules/flashcardset/flashcardset.service.ts',
            'apps/assessment-service/src/modules/examsession/examsession.service.ts',
            'apps/assessment-service/src/modules/examattempt/examattempt.service.ts',
            'apps/content-service/src/modules/quiz-practice/quiz-practice.service.ts',
        ]) {
            expect(read(join(ROOT, f))).toContain('verifyAccessCodeOrThrow');
        }
    });

    it('access codes come from ONE crypto.randomInt generator; no Math.random in the sharing modules', () => {
        const guard = read(
            join(ROOT, 'apps/content-service/src/modules/common/access-code-guard.ts')
        );
        expect(guard).toContain('randomInt(0, 1_000_000)');
        expect(guard).not.toContain('Math.random');
        for (const dir of [
            'content-service/src/modules/flashcardset',
            'assessment-service/src/modules/examsession',
            'content-service/src/modules/quizset',
        ]) {
            const files = sourceFiles(join(ROOT, 'apps', dir));
            expect(files.length).toBeGreaterThan(0);
            for (const f of files) {
                const src = read(f);
                expect(`${f}: ${src.includes('Math.random')}`).toBe(`${f}: false`);
            }
        }
        for (const f of [
            'content-service/src/modules/flashcardset/flashcardset.service.ts',
            'assessment-service/src/modules/examsession/examsession.service.ts',
            'content-service/src/modules/quizset/quizset-sharing.service.ts',
        ]) {
            const src = read(join(ROOT, 'apps', f));
            expect(src).toContain('generateAccessCode');
            expect(src).not.toContain('randomInt');
        }
    });

    it('the shared guard compares with timingSafeEqual', () => {
        expect(
            read(
                join(
                    ROOT,
                    'apps/content-service/src/modules/common/access-code-guard.ts'
                )
            )
        ).toContain('timingSafeEqual');
    });

    it("access helpers never look at the owner's role or admin flag (owner-role independence)", () => {
        for (const f of [
            'apps/content-service/src/modules/flashcardset/flashcardset-access.ts',
            'apps/content-service/src/modules/quizset/quizset-access.ts',
            'apps/content-service/src/modules/quizset/quizset-owner.resolver.ts',
            'apps/assessment-service/src/modules/examattempt/examattempt-access.ts',
            'apps/content-service/src/modules/flashcardset/flashcardset-public.mapper.ts',
            'apps/assessment-service/src/modules/examsession/examsession-public.mapper.ts',
            'apps/assessment-service/src/modules/student-exam/student-exam-access.ts',
        ]) {
            const file = join(ROOT, f);
            expect(existsSync(file)).toBe(true);
            expect(read(file)).not.toMatch(/role|isSystemAdmin/i);
        }
    });

    it('the WS gate reads the very Redis key the gateway writes (gw:user:<id>:av)', () => {
        expect(studyRoomKey('u1')).toBe(gatewayKey('u1'));
        expect(studyRoomKey('u1')).toBe('gw:user:u1:av');
    });
});
