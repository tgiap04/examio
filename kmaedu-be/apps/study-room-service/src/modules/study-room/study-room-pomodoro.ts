import { TimerState, TimerPhase } from './study-room.events';

export interface PomodoroConfig {
    workMinutes: number;
    breakMinutes: number;
    longBreakMinutes: number;
    cyclesBeforeLongBreak: number;
}

const MIN = 60_000;

export function phaseDurationMs(phase: TimerPhase, cfg: PomodoroConfig): number {
    switch (phase) {
        case 'work':
            return cfg.workMinutes * MIN;
        case 'break':
            return cfg.breakMinutes * MIN;
        case 'longbreak':
            return cfg.longBreakMinutes * MIN;
    }
}

// Pha kế tiếp theo chu kỳ Pomodoro.
export function nextPhase(
    phase: TimerPhase,
    cycle: number,
    cfg: PomodoroConfig
): { phase: TimerPhase; cycle: number } {
    if (phase === 'work') {
        if (cycle >= cfg.cyclesBeforeLongBreak) {
            return { phase: 'longbreak', cycle };
        }
        return { phase: 'break', cycle };
    }
    if (phase === 'break') {
        return { phase: 'work', cycle: cycle + 1 };
    }
    // longbreak → về đầu chu kỳ
    return { phase: 'work', cycle: 1 };
}

// Chuẩn hoá timer đang chạy về pha thực tại (tất định — cùng công thức ở client & server).
export function normalizeTimer(
    timer: TimerState,
    cfg: PomodoroConfig,
    now: number
): TimerState {
    if (!timer.running) return timer;

    let { phase, cycle, phaseStartedAt } = timer;
    // Chặn vòng lặp vô hạn (thực tế < 24h TTL nên rất ít vòng).
    for (let guard = 0; guard < 10_000; guard++) {
        const dur = phaseDurationMs(phase, cfg);
        if (now - phaseStartedAt < dur) break;
        phaseStartedAt += dur;
        const nxt = nextPhase(phase, cycle, cfg);
        phase = nxt.phase;
        cycle = nxt.cycle;
    }

    return { ...timer, phase, cycle, phaseStartedAt };
}

export function freshTimer(now: number, running: boolean): TimerState {
    return { phase: 'work', cycle: 1, phaseStartedAt: now, running };
}
