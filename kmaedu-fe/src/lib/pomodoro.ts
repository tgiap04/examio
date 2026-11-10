import { PomodoroConfig, TimerPhase, TimerState } from "@/types/studyRoom";

// Bản sao thuần (client) của engine Pomodoro tất định phía backend.
// Cùng công thức → client tự tính pha/đếm ngược mà không cần server tick.

const MIN = 60_000;

export function phaseDurationMs(phase: TimerPhase, cfg: PomodoroConfig): number {
  if (phase === "work") return cfg.workMinutes * MIN;
  if (phase === "break") return cfg.breakMinutes * MIN;
  return cfg.longBreakMinutes * MIN;
}

function nextPhase(
  phase: TimerPhase,
  cycle: number,
  cfg: PomodoroConfig,
): { phase: TimerPhase; cycle: number } {
  if (phase === "work") {
    if (cycle >= cfg.cyclesBeforeLongBreak) return { phase: "longbreak", cycle };
    return { phase: "break", cycle };
  }
  if (phase === "break") return { phase: "work", cycle: cycle + 1 };
  return { phase: "work", cycle: 1 };
}

export interface TimerView {
  phase: TimerPhase;
  cycle: number;
  remainingMs: number;
  durationMs: number;
  progress: number; // 0..1 đã trôi qua
  running: boolean;
}

// Tính view hiện tại từ state + config + thời điểm now.
export function computeTimerView(
  timer: TimerState,
  cfg: PomodoroConfig,
  now: number,
): TimerView {
  if (!timer.running) {
    const durationMs = phaseDurationMs(timer.phase, cfg);
    const remainingMs =
      timer.pausedRemainingMs != null ? timer.pausedRemainingMs : durationMs;
    return {
      phase: timer.phase,
      cycle: timer.cycle,
      remainingMs,
      durationMs,
      progress: durationMs > 0 ? 1 - remainingMs / durationMs : 0,
      running: false,
    };
  }

  let { phase, cycle, phaseStartedAt } = timer;
  for (let guard = 0; guard < 10_000; guard++) {
    const dur = phaseDurationMs(phase, cfg);
    if (now - phaseStartedAt < dur) break;
    phaseStartedAt += dur;
    const nxt = nextPhase(phase, cycle, cfg);
    phase = nxt.phase;
    cycle = nxt.cycle;
  }

  const durationMs = phaseDurationMs(phase, cfg);
  const elapsed = now - phaseStartedAt;
  const remainingMs = Math.max(0, durationMs - elapsed);
  return {
    phase,
    cycle,
    remainingMs,
    durationMs,
    progress: durationMs > 0 ? Math.min(1, elapsed / durationMs) : 0,
    running: true,
  };
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const PHASE_LABEL: Record<TimerPhase, string> = {
  work: "Đang học",
  break: "Nghỉ ngắn",
  longbreak: "Nghỉ dài",
};
