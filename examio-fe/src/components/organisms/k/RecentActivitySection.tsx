import { memo } from "react";
import {
  RecentActivityItem,
  type RecentActivityItemData,
} from "@/components/molecules/RecentActivityItem";

interface RecentActivitySectionProps {
  activities: RecentActivityItemData[];
  maxItems?: number;
}

const RecentActivitySectionComponent = ({
  activities,
  maxItems = 5,
}: RecentActivitySectionProps) => {
  const displayActivities = activities.slice(0, maxItems);

  return (
    <div className="rounded-lg border border-hairline bg-canvas p-4">
      <div className="mb-4 border-b border-hairline pb-4">
        <h2 className="text-lg font-medium text-ink">Hoạt động gần đây</h2>
        <p className="text-sm text-muted-foreground">
          Các hoạt động và thành tích học tập mới nhất
        </p>
      </div>

      <div className="divide-y divide-hairline">
        {displayActivities.length > 0 ? (
          displayActivities.map((activity) => (
            <RecentActivityItem key={activity.id} item={activity} />
          ))
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Chưa có hoạt động nào
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

RecentActivitySectionComponent.displayName = "RecentActivitySection";

export const RecentActivitySection = memo(RecentActivitySectionComponent);
