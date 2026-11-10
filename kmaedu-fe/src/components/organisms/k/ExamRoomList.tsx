import { memo } from "react";
import { ExamRoomCardItem } from "@/components/molecules/ExamRoomCardItem";

export interface ExamRoom {
  id: string;
  name: string;
  roomType: string;
  questionCount: number;
  isPrivate?: boolean;
}

export interface ExamRoomListProps {
  rooms: ExamRoom[];
  filter?: string;
  onFilterChange?: (value: string) => void;
  onViewRoom: (id: string) => void;
  onEditRoom?: (id: string) => void;
  onDeleteRoom?: (id: string) => void;
}

const ExamRoomListComponent = ({
  rooms,
  filter: _filter,
  onFilterChange: _onFilterChange,
  onViewRoom,
  onEditRoom,
  onDeleteRoom,
}: ExamRoomListProps) => {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-4">
      <div className="mb-4 border-b border-hairline pb-4">
        <h2 className="text-lg font-medium text-ink">Danh sách phòng thi</h2>
        <p className="text-sm text-muted-foreground">
          {rooms.length} phòng thi
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {rooms.map((room) => (
          <ExamRoomCardItem
            key={room.id}
            name={room.name}
            roomType={room.roomType}
            questionCount={room.questionCount}
            isPrivate={room.isPrivate}
            onViewDetails={() => onViewRoom(room.id)}
            onEdit={onEditRoom ? () => onEditRoom(room.id) : undefined}
            onDelete={onDeleteRoom ? () => onDeleteRoom(room.id) : undefined}
          />
        ))}
      </div>

      {rooms.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">Chưa có phòng thi nào</p>
        </div>
      )}
    </div>
  );
};

ExamRoomListComponent.displayName = "ExamRoomList";

export const ExamRoomList = memo(ExamRoomListComponent);
