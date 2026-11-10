import { Card, CardContent, CardHeader, CardTitle } from "@/components/antd/card";
import {
  TrendingTopicItem,
  type TrendingTopic,
} from "@/components/molecules/TrendingTopicItem";
import {
  UpcomingSessionCard,
  type StudySession,
} from "@/components/molecules/UpcomingSessionCard";

interface TrendingSidebarProps {
  trendingTopics: TrendingTopic[];
  upcomingSessions: StudySession[];
  onTopicClick?: (topicId: string) => void;
  onSessionJoin?: (sessionId: string) => void;
}

export function TrendingSidebar({
  trendingTopics,
  upcomingSessions,
  onTopicClick,
  onSessionJoin,
}: TrendingSidebarProps) {
  return (
    <div className="space-y-6">
      {/* Trending Topics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">
            Chủ đề xu hướng
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {trendingTopics.map((topic) => (
            <TrendingTopicItem
              key={topic.id}
              topic={topic}
              onClick={() => onTopicClick?.(topic.id)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Upcoming Study Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">
            Buổi học sắp tới
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcomingSessions.map((session) => (
            <UpcomingSessionCard
              key={session.id}
              session={session}
              onJoin={() => onSessionJoin?.(session.id)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
