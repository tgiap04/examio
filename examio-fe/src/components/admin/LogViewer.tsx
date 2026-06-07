import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface LogViewerProps {
  lines: string[];
  emptyText?: string;
  maxLines?: number;
  className?: string;
}

export function LogViewer({
  lines,
  emptyText,
  maxLines = 200,
  className = "",
}: LogViewerProps) {
  const { t } = useTranslation("admin");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  const visible = lines.length > maxLines ? lines.slice(-maxLines) : lines;

  useEffect(() => {
    if (!containerRef.current || !stickToBottom.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [visible.length]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceFromBottom < 20;
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-auto rounded-md border border-hairline bg-[#181715] p-3 font-mono text-[12px] leading-5 text-[#e6dfd8] shadow-inner ${className}`}
      style={{ minHeight: 360, maxHeight: 540 }}
    >
      {visible.length === 0
        ? (
          <div className="italic text-[#a99f91]">
            {emptyText ?? t("logs.empty")}
          </div>
        )
        : visible.map((line, idx) => (
          <div key={idx} className="whitespace-pre-wrap break-all">
            {line || " "}
          </div>
        ))}
    </div>
  );
}
