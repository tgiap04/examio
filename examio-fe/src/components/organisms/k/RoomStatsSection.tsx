import { memo } from "react";
import { RoomStatsCard } from "@/components/molecules/RoomStatsCard";
import { DoorOpen, Users } from "lucide-react";

interface RoomStats {
  activeRooms: number;
  totalParticipants: number;
  ongoingExams: number;
  completedToday: number;
}

interface RoomStatsSectionProps {
  stats: RoomStats;
}

const RoomStatsSectionComponent = ({ stats }: RoomStatsSectionProps) => {
  return (
    <div className="grid grid-cols-2 gap-2 mb-8">
      <RoomStatsCard
        icon={DoorOpen}
        label="Phòng thi đang hoạt động"
        value={stats.activeRooms}
        iconColor="text-coral"
        iconBgColor="bg-coral/10"
      />
      <RoomStatsCard
        icon={Users}
        label="Tổng số thí sinh"
        value={stats.totalParticipants}
        iconColor="text-success"
        iconBgColor="bg-success/10"
      />
    </div>
  );
};

RoomStatsSectionComponent.displayName = "RoomStatsSection";

export const RoomStatsSection = memo(RoomStatsSectionComponent);
