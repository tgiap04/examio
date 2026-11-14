import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Plus, Users } from "lucide-react";
import { Button } from "@/components/antd/button";
import { useAuthStore } from "@/stores/useAuthStore";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { StudyRoomListItem } from "@/types/studyRoom";
import { useCan } from "@/hooks/useCan";
import { CreateRoomModal } from "./components/create-room-modal";
import { JoinByCodeModal } from "./components/join-by-code-modal";
import { RoomCard } from "./components/room-card";
import { RoomAccessModal } from "./components/room-access-modal";

export default function StudyRoomListPage() {
  const navigate = useNavigate();
  const myRooms = useStudyRoomStore((s) => s.myRooms);
  const loading = useStudyRoomStore((s) => s.loadingMine);
  const fetchMyRooms = useStudyRoomStore((s) => s.fetchMyRooms);
  const myId = useAuthStore((s) => String(s.user?.id ?? ""));
  const canCreate = useCan("study_room:create");
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [configRoom, setConfigRoom] = useState<StudyRoomListItem | null>(null);

  useEffect(() => {
    fetchMyRooms();
  }, [fetchMyRooms]);

  const enter = (id: string) => navigate(`/k/study-room/${id}`);

  return (
    <div>
      <div>
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
              Phòng học nhóm
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Học cùng nhau với Pomodoro, nhạc nền và trò chuyện thời gian thực
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setJoinOpen(true)}>
              <LogIn className="mr-1.5 h-4 w-4" /> Nhập mã
            </Button>
            {canCreate && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Tạo phòng
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        {loading && myRooms.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-xl border border-hairline bg-surface-card"
              />
            ))}
          </div>
        ) : myRooms.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-hairline bg-surface-card py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-display text-lg text-ink">
                Chưa có phòng học nào
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {canCreate
                  ? "Tạo phòng đầu tiên hoặc nhập mã để tham gia phòng của bạn bè"
                  : "Nhập mã để tham gia phòng của bạn bè"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setJoinOpen(true)}>
                <LogIn className="mr-1.5 h-4 w-4" /> Nhập mã
              </Button>
              {canCreate && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Tạo phòng
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                isHost={room.hostId === myId}
                onEnter={enter}
                onConfig={setConfigRoom}
              />
            ))}
          </div>
        )}
      </div>

      {canCreate && (
        <CreateRoomModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={enter}
        />
      )}
      <JoinByCodeModal
        open={joinOpen}
        onOpenChange={setJoinOpen}
        onJoined={enter}
      />
      <RoomAccessModal
        room={configRoom}
        open={!!configRoom}
        onOpenChange={(o) => !o && setConfigRoom(null)}
      />
    </div>
  );
}
