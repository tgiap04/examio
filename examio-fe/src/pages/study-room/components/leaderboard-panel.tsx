import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trophy } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/antd/card";
import { Button } from "@/components/antd/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/antd/avatar";
import { getStudyRoomLeaderboardApi } from "@/apis/studyRoomApi";
import { LeaderboardEntry } from "@/types/studyRoom";

interface Props {
  roomId: string;
}

function formatFocus(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function LeaderboardPanel({ roomId }: Props) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStudyRoomLeaderboardApi(roomId);
      setRows(
        [...data].sort((a, b) => b.totalFocusSeconds - a.totalFocusSeconds),
      );
    } catch {
      /* im lặng — bảng xếp hạng không chặn phòng */
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 !text-base">
          <Trophy className="h-4 w-4 text-warning" /> Bảng tập trung
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={load} loading={loading}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="max-h-60 space-y-2 overflow-y-auto pb-4">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Chưa có dữ liệu tập trung
          </p>
        ) : (
          rows.map((row, i) => {
            const name = row.user.name || "Ẩn danh";
            return (
              <div key={row.userId} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-center font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <Avatar size="small">
                  <AvatarImage src={row.user.avatar ?? undefined} alt={name} />
                  <AvatarFallback>
                    {name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-ink">{name}</span>
                <span className="font-medium tabular-nums text-ink">
                  {formatFocus(row.totalFocusSeconds)}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
