import { memo } from "react";
import {
  ChevronRight,
  Globe,
  KeyRound,
  Lock,
  Settings2,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/antd/avatar";
import { Badge } from "@/components/antd/badge";
import { cn } from "@/lib/utils";
import { AccessType, StudyRoomListItem } from "@/types/studyRoom";

// Nhãn chế độ vào phòng: công khai / mã số / riêng tư (whitelist).
const ACCESS: Record<
  number,
  { label: string; icon: typeof Globe; variant: "success" | "warning" | "info" }
> = {
  [AccessType.PUBLIC]: { label: "Công khai", icon: Globe, variant: "success" },
  [AccessType.CODE]: { label: "Mã số", icon: KeyRound, variant: "warning" },
  [AccessType.WHITELIST]: { label: "Riêng tư", icon: Lock, variant: "info" },
};

interface Props {
  room: StudyRoomListItem;
  isHost: boolean;
  onEnter: (id: string) => void;
  onConfig: (room: StudyRoomListItem) => void;
}

function RoomCardBase({ room, isHost, onEnter, onConfig }: Props) {
  const access = ACCESS[room.accessType ?? AccessType.PUBLIC] ?? ACCESS[AccessType.PUBLIC];
  const AccessIcon = access.icon;
  const members = room._count?.members ?? 0;
  const initials = room.name.trim().charAt(0).toUpperCase() || "P";
  const closed = !room.isActive;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Vào phòng ${room.name}`}
      onClick={() => onEnter(room.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEnter(room.id);
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col rounded-xl border border-hairline bg-surface-card p-5 transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        closed && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-display text-lg text-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg leading-tight text-ink">
            {room.name}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {room.description || "Học cùng nhau với Pomodoro & nhạc nền"}
          </p>
        </div>
        {isHost && (
          <button
            type="button"
            aria-label="Cấu hình quyền truy cập"
            onClick={(e) => {
              e.stopPropagation();
              onConfig(room);
            }}
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-cream-strong hover:text-ink"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Badge variant={access.variant}>
          <AccessIcon className="mr-1 h-3 w-3" />
          {access.label}
        </Badge>
        {isHost && <Badge variant="secondary">Chủ phòng</Badge>}
        {closed && <Badge variant="secondary">Đã đóng</Badge>}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar size="small">
            <AvatarImage
              src={room.host?.avatar ?? undefined}
              alt={room.host?.name ?? ""}
            />
            <AvatarFallback>
              {(room.host?.name ?? "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm text-muted-foreground">
            {room.host?.name ?? "Chủ phòng"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {members}/{room.maxParticipants}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
      </div>
    </div>
  );
}

export const RoomCard = memo(RoomCardBase);
