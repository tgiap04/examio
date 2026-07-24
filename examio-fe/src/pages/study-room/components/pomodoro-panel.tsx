import { memo, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Settings2 } from "lucide-react";
import { Card, CardContent } from "@/components/antd/card";
import { Button } from "@/components/antd/button";
import { Progress } from "@/components/antd/progress";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { StudyRoomRole, PomodoroConfig } from "@/types/studyRoom";
import {
  computeTimerView,
  formatRemaining,
  PHASE_LABEL,
} from "@/lib/pomodoro";
import { PomodoroConfigFields } from "./pomodoro-config-fields";
import { StudyRoomActions } from "./study-room-actions";

interface Props {
  actions: StudyRoomActions;
  myRole: number;
}

function PomodoroPanelBase({ actions, myRole }: Props) {
  const timer = useStudyRoomStore((s) => s.timer);
  const config = useStudyRoomStore((s) => s.config);
  const [, forceTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PomodoroConfig | null>(null);
  const lastPhase = useRef<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  if (!timer || !config) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Đang tải bộ đếm…
        </CardContent>
      </Card>
    );
  }

  const view = computeTimerView(timer, config, Date.now());
  if (lastPhase.current && lastPhase.current !== view.phase) {
    document.title = `${PHASE_LABEL[view.phase]} · Phòng học`;
  }
  lastPhase.current = view.phase;

  const canControl = myRole >= StudyRoomRole.COHOST;
  const isHost = myRole >= StudyRoomRole.HOST;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-5">
        <span className="rounded-full bg-surface-cream-strong px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink">
          {PHASE_LABEL[view.phase]} · Chu kỳ {view.cycle}/
          {config.cyclesBeforeLongBreak}
        </span>
        <div className="font-display text-5xl tabular-nums tracking-tight text-ink">
          {formatRemaining(view.remainingMs)}
        </div>
        <Progress value={view.progress * 100} className="w-full" />

        {canControl && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {view.running ? (
              <Button variant="secondary" onClick={actions.pauseTimer}>
                <Pause className="h-4 w-4" /> Tạm dừng
              </Button>
            ) : (
              <Button onClick={actions.startTimer}>
                <Play className="h-4 w-4" /> Bắt đầu
              </Button>
            )}
            <Button variant="outline" onClick={actions.resetTimer}>
              <RotateCcw className="h-4 w-4" /> Đặt lại
            </Button>
            {isHost && (
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(config);
                  setEditing((v) => !v);
                }}
              >
                <Settings2 className="h-4 w-4" /> Cấu hình
              </Button>
            )}
          </div>
        )}

        {isHost && editing && draft && (
          <div className="w-full border-t border-hairline pt-4">
            <PomodoroConfigFields value={draft} onChange={setDraft} />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Huỷ
              </Button>
              <Button
                onClick={() => {
                  actions.updateConfig(draft);
                  setEditing(false);
                }}
              >
                Lưu cấu hình
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const PomodoroPanel = memo(PomodoroPanelBase);
