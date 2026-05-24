import { Button } from "@/components/antd/button";
import { Lock, FileText, HelpCircle, Edit, Trash2 } from "lucide-react";
import { RoomInfoRow } from "./RoomInfoRow";

interface ExamRoomCardItemProps {
  name: string;
  roomType: string;
  questionCount: number;
  onViewDetails?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isPrivate?: boolean;
}

export function ExamRoomCardItem({
  name,
  roomType,
  questionCount,
  isPrivate = false,
  onViewDetails,
  onEdit,
  onDelete,
}: ExamRoomCardItemProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-hairline bg-surface-soft p-3 transition-colors hover:bg-canvas">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        {isPrivate && (
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-coral/10">
            <Lock className="h-3.5 w-3.5 text-coral" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-ink">
            {name}
          </h3>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <RoomInfoRow
          icon={FileText}
          label="Bộ đề"
          value={roomType}
          iconColor="text-coral"
        />
        <RoomInfoRow
          icon={HelpCircle}
          label="Câu hỏi"
          value={`${questionCount} câu`}
          iconColor="text-accent-amber"
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 border-hairline text-xs"
          onClick={onViewDetails}>
          Xem chi tiết
        </Button>
        {onEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:bg-surface-card hover:text-ink"
            onClick={onEdit}>
            <Edit className="h-3.5 w-3.5" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:bg-error/10 hover:text-error"
            onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
