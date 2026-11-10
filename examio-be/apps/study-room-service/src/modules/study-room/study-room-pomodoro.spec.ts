import {
    normalizeTimer,
    nextPhase,
    phaseDurationMs,
    freshTimer,
    PomodoroConfig,
} from './study-room-pomodoro';
import { TimerState } from './study-room.events';

const cfg: PomodoroConfig = {
    workMinutes: 30,
    breakMinutes: 5,
    longBreakMinutes: 15,
    cyclesBeforeLongBreak: 4,
};
const MIN = 60_000;

describe('study-room pomodoro engine', () => {
    it('phaseDurationMs trả đúng theo pha', () => {
        expect(phaseDurationMs('work', cfg)).toBe(30 * MIN);
        expect(phaseDurationMs('break', cfg)).toBe(5 * MIN);
        expect(phaseDurationMs('longbreak', cfg)).toBe(15 * MIN);
    });

    describe('nextPhase', () => {
        it('work → break khi chưa đủ chu kỳ', () => {
            expect(nextPhase('work', 1, cfg)).toEqual({ phase: 'break', cycle: 1 });
        });
        it('work → longbreak khi đạt cyclesBeforeLongBreak', () => {
            expect(nextPhase('work', 4, cfg)).toEqual({
                phase: 'longbreak',
                cycle: 4,
            });
        });
        it('break → work chu kỳ kế', () => {
            expect(nextPhase('break', 1, cfg)).toEqual({ phase: 'work', cycle: 2 });
        });
        it('longbreak → work chu kỳ 1', () => {
            expect(nextPhase('longbreak', 4, cfg)).toEqual({
                phase: 'work',
                cycle: 1,
            });
        });
    });

    describe('normalizeTimer', () => {
        it('không đổi khi timer dừng', () => {
            const t: TimerState = freshTimer(1000, false);
            expect(normalizeTimer(t, cfg, 1000 + 999 * MIN)).toEqual(t);
        });

        it('giữ nguyên pha work khi chưa hết giờ', () => {
            const start = 1_000_000;
            const t = freshTimer(start, true);
            const out = normalizeTimer(t, cfg, start + 10 * MIN);
            expect(out.phase).toBe('work');
            expect(out.cycle).toBe(1);
            expect(out.phaseStartedAt).toBe(start);
        });

        it('chuyển sang break sau khi hết pha work', () => {
            const start = 0;
            const t = freshTimer(start, true);
            const out = normalizeTimer(t, cfg, 31 * MIN);
            expect(out.phase).toBe('break');
            expect(out.cycle).toBe(1);
            expect(out.phaseStartedAt).toBe(30 * MIN);
        });

        it('đạt long-break sau đủ số chu kỳ work', () => {
            // 4 chu kỳ (work+break) = 4*(30+5)=140', tới work#4 hết → longbreak.
            const start = 0;
            const t = freshTimer(start, true);
            // sau 3 chu kỳ đầy (105') + trọn work#4 (30') = 135' → vào longbreak
            const out = normalizeTimer(t, cfg, 135 * MIN + 1);
            expect(out.phase).toBe('longbreak');
            expect(out.cycle).toBe(4);
        });

        it('long-break xong quay lại work chu kỳ 1', () => {
            const start = 0;
            const t = freshTimer(start, true);
            // 135' longbreak bắt đầu, +15' = 150' → work cycle 1
            const out = normalizeTimer(t, cfg, 150 * MIN + 1);
            expect(out.phase).toBe('work');
            expect(out.cycle).toBe(1);
        });
    });
});
