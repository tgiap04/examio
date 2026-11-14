import { InputNumber } from "antd";
import { PomodoroConfig } from "@/types/studyRoom";

interface Props {
  value: PomodoroConfig;
  onChange: (value: PomodoroConfig) => void;
  disabled?: boolean;
}

const FIELDS: { key: keyof PomodoroConfig; label: string; min: number }[] = [
  { key: "workMinutes", label: "Học (phút)", min: 1 },
  { key: "breakMinutes", label: "Nghỉ ngắn (phút)", min: 1 },
  { key: "longBreakMinutes", label: "Nghỉ dài (phút)", min: 1 },
  { key: "cyclesBeforeLongBreak", label: "Số chu kỳ / nghỉ dài", min: 1 },
];

export function PomodoroConfigFields({ value, onChange, disabled }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {FIELDS.map((field) => (
        <label key={field.key} className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{field.label}</span>
          <InputNumber
            min={field.min}
            max={180}
            disabled={disabled}
            value={value[field.key]}
            onChange={(v) =>
              onChange({ ...value, [field.key]: Number(v ?? field.min) })
            }
            className="!w-full"
          />
        </label>
      ))}
    </div>
  );
}
