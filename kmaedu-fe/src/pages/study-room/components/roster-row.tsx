import { Ban, Crown, MicOff, MoreVertical, Shield } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/antd/avatar";
import { Badge } from "@/components/antd/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/antd/dropdown-menu";
import { RosterEntry, StudyRoomRole } from "@/types/studyRoom";
import { StudyRoomActions } from "./study-room-actions";

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

function statusText(entry: RosterEntry): string {
  if (entry.status === "studying") return "📖 Đang học";
  if (entry.status === "break") return "☕ Nghỉ";
  return entry.online ? "Trực tuyến" : "Ngoại tuyến";
}

interface RowProps {
  entry: RosterEntry;
  myRole: number;
  myId: string;
  blocked: boolean;
  actions: StudyRoomActions;
}

export function RosterRow({ entry, myRole, myId, blocked, actions }: RowProps) {
  const isSelf = entry.userId === myId;
  const isHost = myRole >= StudyRoomRole.HOST;
  // Kiểm duyệt: cohost+ và không tác động lên host hoặc người role >= mình.
  const canModerate =
    myRole >= StudyRoomRole.COHOST &&
    entry.role < myRole &&
    entry.role < StudyRoomRole.HOST;
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
          {entry.isMuted && (
            <Badge variant="secondary">
              <MicOff className="h-3 w-3" /> Cấm chat
            </Badge>
          )}
          {entry.isBanned && (
            <Badge variant="destructive">
              <Ban className="h-3 w-3" /> Bị ban
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {statusText(entry)}
        </span>
      </div>
      {!isSelf && (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button type="button" className="p-1 text-muted-foreground">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {blocked ? (
              <DropdownMenuItem onClick={() => actions.unblockUser(entry.userId)}>
                Bỏ chặn chat
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => actions.blockUser(entry.userId)}>
                Chặn chat
              </DropdownMenuItem>
            )}
            {canModerate && (
              <>
                <DropdownMenuSeparator />
                {entry.isMuted ? (
                  <DropdownMenuItem
                    onClick={() => actions.unmuteUser(entry.userId)}
                  >
                    Bỏ cấm chat
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => actions.muteUser(entry.userId)}>
                    Cấm chat
                  </DropdownMenuItem>
                )}
                {entry.isBanned ? (
                  <DropdownMenuItem
                    onClick={() => actions.unbanUser(entry.userId)}
                  >
                    Bỏ ban
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => actions.banUser(entry.userId)}
                  >
                    Ban khỏi phòng
                  </DropdownMenuItem>
                )}
              </>
            )}
            {isHost && (
              <>
                <DropdownMenuSeparator />
                {entry.role >= StudyRoomRole.COHOST ? (
                  <DropdownMenuItem
                    onClick={() => actions.revokeRole(entry.userId)}
                  >
                    Gỡ quyền co-host
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => actions.grantRole(entry.userId)}
                  >
                    Cấp quyền co-host
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
