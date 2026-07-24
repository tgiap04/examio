import { memo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/antd/card";
import { Badge } from "@/components/antd/badge";
import { useAuthStore } from "@/stores/useAuthStore";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { StudyRoomActions } from "./study-room-actions";
import { RosterRow } from "./roster-row";

interface Props {
  actions: StudyRoomActions;
  myRole: number;
}

function RosterPanelBase({ actions, myRole }: Props) {
  const roster = useStudyRoomStore((s) => s.roster);
  const myBlocks = useStudyRoomStore((s) => s.myBlocks);
  const myId = String(useAuthStore.getState().user?.id ?? "");
  const online = roster.filter((r) => r.online).length;
  const blockedSet = new Set(myBlocks);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex shrink-0 items-center justify-between">
        <CardTitle className="!text-base">Thành viên</CardTitle>
        <Badge variant="secondary">{online} trực tuyến</Badge>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto pb-4">
        {roster.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Chưa có thành viên
          </p>
        ) : (
          roster.map((entry) => (
            <RosterRow
              key={entry.userId}
              entry={entry}
              myRole={myRole}
              myId={myId}
              blocked={blockedSet.has(entry.userId)}
              actions={actions}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export const RosterPanel = memo(RosterPanelBase);
