import { memo } from "react";
import { ParticipantListItem } from "@/components/molecules/ParticipantListItem";

export interface Participant {
  id: string;
  name: string;
  examName: string;
  status: "online" | "offline" | "away";
  avatar: string;
}

interface RecentParticipantsListProps {
  participants: Participant[];
  onViewAll?: () => void;
}

const RecentParticipantsListComponent = ({
  participants,
  onViewAll: _onViewAll,
}: RecentParticipantsListProps) => {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-4">
      <div className="mb-4 border-b border-hairline pb-4">
        <h2 className="text-lg font-medium text-ink">Thí sinh gần đây</h2>
      </div>

      <div className="divide-y divide-hairline">
        {participants.map((participant) => (
          <ParticipantListItem
            key={participant.id}
            name={participant.name}
            subtitle={participant.examName}
            status={participant.status}
            avatar={participant.avatar}
          />
        ))}
      </div>

      {participants.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm text-muted-foreground">Chưa có thí sinh gần đây</p>
        </div>
      )}
    </div>
  );
};

RecentParticipantsListComponent.displayName = "RecentParticipantsList";

export const RecentParticipantsList = memo(RecentParticipantsListComponent);
