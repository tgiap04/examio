import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Plus, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/antd/card";
import { Button } from "@/components/antd/button";
import { Badge } from "@/components/antd/badge";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { CreateRoomModal } from "./components/create-room-modal";
import { JoinByCodeModal } from "./components/join-by-code-modal";

export default function StudyRoomListPage() {
  const navigate = useNavigate();
  const myRooms = useStudyRoomStore((s) => s.myRooms);
  const loading = useStudyRoomStore((s) => s.loadingMine);
  const fetchMyRooms = useStudyRoomStore((s) => s.fetchMyRooms);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  useEffect(() => {
    fetchMyRooms();
  }, [fetchMyRooms]);

  const enter = (id: string) => navigate(`/k/study-room/${id}`);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-2xl tracking-tight text-ink">
              Phòng học nhóm
            </h1>
            <p className="text-xs text-muted-foreground md:text-sm">
              Học cùng nhau với Pomodoro, nhạc nền và trò chuyện thời gian thực
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setJoinOpen(true)}>
              <LogIn className="mr-1 h-4 w-4" /> Nhập mã
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Tạo phòng
            </Button>
          </div>
        </div>

        {loading && myRooms.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : myRooms.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">
                Bạn chưa tham gia phòng học nào
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Tạo phòng đầu tiên
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => enter(room.id)}
                className="text-left"
              >
                <Card className="h-full transition-shadow hover:!shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="!text-lg">{room.name}</CardTitle>
                      {!room.isActive && (
                        <Badge variant="secondary">Đã đóng</Badge>
                      )}
                    </div>
                    {room.description && (
                      <CardDescription className="line-clamp-2">
                        {room.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="flex items-center justify-between pb-6 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {room._count?.members ?? 0}/{room.maxParticipants}
                    </span>
                    <span className="truncate">
                      {room.host?.name ?? "Chủ phòng"}
                    </span>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

      <CreateRoomModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={enter}
      />
      <JoinByCodeModal
        open={joinOpen}
        onOpenChange={setJoinOpen}
        onJoined={enter}
      />
    </div>
  );
}
