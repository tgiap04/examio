import { memo, useState } from "react";
import { MessagesSquare, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { StudyRoomActions } from "./study-room-actions";
import { ChatPanel } from "./chat-panel";
import { RosterPanel } from "./roster-panel";
import { LeaderboardPanel } from "./leaderboard-panel";

type RailTab = "chat" | "members" | "ranks";

interface Props {
  actions: StudyRoomActions;
  myRole: number;
  roomId: string;
}

// Cột phải "watch-party": chuyển giữa Trò chuyện / Thành viên / Xếp hạng.
// Cả ba pane luôn mount (ẩn bằng `hidden`) để giữ scroll chat và tránh gọi lại
// API bảng xếp hạng mỗi lần đổi tab.
function RoomRailTabsBase({ actions, myRole, roomId }: Props) {
  const [tab, setTab] = useState<RailTab>("chat");
  const online = useStudyRoomStore(
    (s) => s.roster.filter((r) => r.online).length,
  );

  const tabs = [
    { key: "chat" as const, label: "Trò chuyện", icon: MessagesSquare },
    { key: "members" as const, label: "Thành viên", icon: Users, badge: online },
    { key: "ranks" as const, label: "Xếp hạng", icon: Trophy },
  ];

  return (
    <div className="flex h-[65vh] flex-col gap-3 lg:h-auto lg:min-h-0 lg:flex-1">
      <div
        role="tablist"
        aria-label="Bảng bên phòng học"
        className="flex shrink-0 gap-1 rounded-xl border border-hairline bg-surface-card p-1"
      >
        {tabs.map(({ key, label, icon: Icon, badge }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:bg-surface-cream-strong hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
              {badge != null && badge > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    active ? "bg-white/20" : "bg-surface-cream-strong text-ink",
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="relative min-h-0 flex-1 [&_.ant-card-body]:flex [&_.ant-card-body]:h-full [&_.ant-card-body]:min-h-0 [&_.ant-card-body]:flex-col [&_.ant-card]:h-full">
        <div className={cn("absolute inset-0", tab !== "chat" && "hidden")}>
          <ChatPanel actions={actions} />
        </div>
        <div className={cn("absolute inset-0", tab !== "members" && "hidden")}>
          <RosterPanel actions={actions} myRole={myRole} />
        </div>
        <div className={cn("absolute inset-0", tab !== "ranks" && "hidden")}>
          <LeaderboardPanel roomId={roomId} />
        </div>
      </div>
    </div>
  );
}

export const RoomRailTabs = memo(RoomRailTabsBase);
