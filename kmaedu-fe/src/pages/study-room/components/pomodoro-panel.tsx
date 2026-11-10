import { memo, useEffect, useState } from "react";
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

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const view =
    timer && config ? computeTimerView(timer, config, Date.now()) : null;

  // Cập nhật document.title trong effect (không phải trong render) — chỉ chạy
  // khi phase đổi thật, tránh side-effect ở render phase.
  useEffect(() => {
    if (view) document.title = `${PHASE_LABEL[view.phase]} · Phòng học`;
    // Chỉ chạy khi phase đổi — KHÔNG thêm `view` (object mới mỗi tick 500ms).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.phase]);

  if (!timer || !config || !view) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Đang tải bộ đếm…
        </CardContent>
      </Card>
    );
  }

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
