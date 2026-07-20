import { memo, useEffect, useRef, useState } from "react";
import { SendHorizonal } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/antd/card";
import { Button } from "@/components/antd/button";
import { Input } from "@/components/antd/input";
import { useStudyRoomStore } from "@/stores/useStudyRoomStore";
import { StudyRoomActions } from "./study-room-actions";

interface Props {
  actions: StudyRoomActions;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChatPanelBase({ actions }: Props) {
  const chat = useStudyRoomStore((s) => s.chat);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = () => {
    const content = text.trim();
    if (!content) return;
    actions.sendChat(content.slice(0, 500));
    setText("");
    nearBottom.current = true;
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="!text-base">Trò chuyện</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 pb-4">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 space-y-3 overflow-y-auto pr-1"
        >
          {chat.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Hãy bắt đầu cuộc trò chuyện
            </p>
          ) : (
            chat.map((m, i) => (
              <div key={`${m.userId}-${m.at}-${i}`} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-ink">{m.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(m.at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-ink/90">
                  {m.content}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Nhập tin nhắn…"
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            onPressEnter={send}
          />
          <Button size="icon" onClick={send} disabled={!text.trim()}>
            <SendHorizonal className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const ChatPanel = memo(ChatPanelBase);
