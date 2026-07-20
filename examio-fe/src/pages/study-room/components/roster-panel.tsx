import { memo } from "react";
import { Crown, MoreVertical, Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/antd/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/antd/avatar";
import { Badge } from "@/components/antd/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/antd/dropdown-menu";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { RosterEntry, StudyRoomRole } from "@/types/studyRoom";
import { StudyRoomActions } from "./study-room-actions";

interface Props {
  actions: StudyRoomActions;
  myRole: number;
}

function roleBadge(role: number) {
  if (role >= StudyRoomRole.HOST)
    return (
      <Badge variant="warning">
        <Crown className="h-3 w-3" /> Chủ phòng
      </Badge>
    );
  if (role >= StudyRoomRole.COHOST)
    return (
      <Badge variant="info">
        <Shield className="h-3 w-3" /> Co-host
      </Badge>
    );
  return null;
}

function RosterRow({
  entry,
  isHost,
  actions,
}: {
  entry: RosterEntry;
  isHost: boolean;
  actions: StudyRoomActions;
}) {
  const canManage = isHost && entry.role < StudyRoomRole.HOST;
  const name = entry.name || "Ẩn danh";
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="relative">
        <Avatar>
          <AvatarImage src={entry.avatar ?? undefined} alt={name} />
          <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-card ${
            entry.online ? "bg-success" : "bg-muted-foreground"
          }`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 truncate text-sm font-medium text-ink">
          <span className="truncate">{name}</span>
          {roleBadge(entry.role)}
        </div>
        <span className="text-xs text-muted-foreground">
          {entry.status === "studying"
            ? "📖 Đang học"
            : entry.status === "break"
              ? "☕ Nghỉ"
              : entry.online
                ? "Trực tuyến"
                : "Ngoại tuyến"}
        </span>
      </div>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button type="button" className="p-1 text-muted-foreground">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {entry.role >= StudyRoomRole.COHOST ? (
              <DropdownMenuItem onClick={() => actions.revokeRole(entry.userId)}>
                Gỡ quyền co-host
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => actions.grantRole(entry.userId)}>
                Cấp quyền co-host
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function RosterPanelBase({ actions, myRole }: Props) {
  const roster = useStudyRoomStore((s) => s.roster);
  const isHost = myRole >= StudyRoomRole.HOST;
  const online = roster.filter((r) => r.online).length;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="!text-base">Thành viên</CardTitle>
        <Badge variant="secondary">{online} trực tuyến</Badge>
      </CardHeader>
      <CardContent className="max-h-72 divide-y divide-hairline overflow-y-auto pb-4">
        {roster.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Chưa có thành viên
          </p>
        ) : (
          roster.map((entry) => (
            <RosterRow
              key={entry.userId}
              entry={entry}
              isHost={isHost}
              actions={actions}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export const RosterPanel = memo(RosterPanelBase);
