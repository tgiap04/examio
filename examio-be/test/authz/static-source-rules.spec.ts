import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { authzVersionKey as gatewayKey } from '../../apps/gateway-service/src/pipeline/auth-state.service';
import { authzVersionKey as examKey } from '../../apps/exam-service/src/modules/study-room/study-room-socket-auth.service';

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

const examSrc = sourceFiles(join(ROOT, 'apps/exam-service/src'));
const read = (f: string) => readFileSync(f, 'utf8');

describe('static security rules (phase 06)', () => {
    it('exam-service has no @Throttle (it has no ThrottlerModule, so it would be a silent no-op)', () => {
        const offenders = examSrc.filter((f) => /@Throttle\b/.test(read(f)));
        expect(offenders).toEqual([]);
    });

    it('no plain-compare of an access code remains in exam-service', () => {
        const offenders = examSrc.filter((f) =>
            /accessCode\?\.toString\(\) !==|providedCode ===/.test(read(f))
        );
        expect(offenders).toEqual([]);
    });

    it('every access-code comparison goes through the shared guard', () => {
        for (const f of [
            'apps/exam-service/src/modules/flashcardset/flashcardset.service.ts',
            'apps/exam-service/src/modules/examsession/examsession.service.ts',
            'apps/exam-service/src/modules/examattempt/examattempt.service.ts',
        ]) {
            expect(read(join(ROOT, f))).toContain('verifyAccessCodeOrThrow');
        }
    });

    it('access codes are generated with crypto.randomInt, never Math.random', () => {
        for (const f of [
            'apps/exam-service/src/modules/flashcardset/flashcardset.service.ts',
            'apps/exam-service/src/modules/examsession/examsession.service.ts',
        ]) {
            const src = read(join(ROOT, f));
            const gen = src.slice(src.indexOf('generateAccessCode()'));
            expect(gen.slice(0, 200)).toContain('randomInt(100000, 1000000)');
            expect(gen.slice(0, 200)).not.toContain('Math.random');
        }
    });

    it('the shared guard compares with timingSafeEqual', () => {
        expect(
            read(
                join(
                    ROOT,
                    'apps/exam-service/src/modules/common/access-code-guard.ts'
                )
            )
        ).toContain('timingSafeEqual');
    });

    it("access helpers never look at the owner's role or admin flag (owner-role independence)", () => {
        for (const f of [
            'apps/exam-service/src/modules/flashcardset/flashcardset-access.ts',
            'apps/exam-service/src/modules/examattempt/examattempt-access.ts',
            'apps/exam-service/src/modules/flashcardset/flashcardset-public.mapper.ts',
            'apps/exam-service/src/modules/examsession/examsession-public.mapper.ts',
            'apps/exam-service/src/modules/student/student-access.ts',
        ]) {
            const file = join(ROOT, f);
            expect(existsSync(file)).toBe(true);
            expect(read(file)).not.toMatch(/role|isSystemAdmin/i);
        }
    });

    it('the WS gate reads the very Redis key the gateway writes (gw:user:<id>:av)', () => {
        expect(examKey('u1')).toBe(gatewayKey('u1'));
        expect(examKey('u1')).toBe('gw:user:u1:av');
    });
});
