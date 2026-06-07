import { useState, useCallback, useRef, useEffect } from "react";
import { Select, Button, Space, Alert } from "antd";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  postLogTicketApi,
  streamLogsUrl,
  getRecentLogsApi,
  RecentLogLine,
} from "@/apis/adminApi";
import { useEventSource, EventSourceStatus } from "@/hooks/useEventSource";
import { LogViewer } from "@/components/admin/LogViewer";
import { BadgePill, type BadgeVariant } from "@/components/admin/BadgePill";
import { toast } from "@/components/antd/toast";

type Service = "auth" | "gateway";

const MAX_LINES = 200;

export function LogStreamPanel() {
  const { t } = useTranslation("admin");
  const [service, setService] = useState<Service>("auth");
  const [tail, setTail] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [esStatus, setEsStatus] = useState<EventSourceStatus>("idle");
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [connectionToken, setConnectionToken] = useState(0);
  const ticketPendingRef = useRef(false);

  const issueTicket = useCallback(async (): Promise<string | null> => {
    if (ticketPendingRef.current) return null;
    ticketPendingRef.current = true;
    try {
      const res = await postLogTicketApi(service);
      return streamLogsUrl(service, res.ticket);
    } catch (err) {
      toast.error(
        t("logs.ticketError", { message: (err as Error).message }),
      );
      return null;
    } finally {
      ticketPendingRef.current = false;
    }
  }, [service, t]);

  useEffect(() => {
    if (!tail) {
      setStreamUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const url = await issueTicket();
      if (cancelled || !url) {
        if (!url) setTail(false);
        return;
      }
      setStreamUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [tail, connectionToken, service, issueTicket]);

  const handleMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as { line?: string; ts?: string };
      const formatted = data.ts
        ? `[${format(new Date(data.ts), "HH:mm:ss")}] ${data.line ?? ""}`
        : (data.line ?? event.data);
      setLines((prev) => {
        const next = [...prev, formatted];
        return next.length > MAX_LINES * 2 ? next.slice(-MAX_LINES) : next;
      });
    } catch {
      setLines((prev) => [...prev, event.data].slice(-MAX_LINES * 2));
    }
  };

  const handleError = () => {
    if (tail) {
      setConnectionToken((tok) => tok + 1);
    }
  };

  const { status } = useEventSource({
    url: streamUrl,
    enabled: tail && streamUrl !== null,
    onMessage: handleMessage,
    onError: handleError,
  });

  useEffect(() => {
    setEsStatus(status);
  }, [status]);

  const startTail = async () => {
    setLines([]);
    setEsStatus("connecting");
    setConnectionToken((tok) => tok + 1);
    setTail(true);
  };

  const stopTail = () => {
    setTail(false);
    setStreamUrl(null);
    setEsStatus("idle");
  };

  const loadRecent = async () => {
    setLoadingRecent(true);
    try {
      const recent: RecentLogLine[] = await getRecentLogsApi(service, 100);
      const formatted = recent.map((r) =>
        `[${format(new Date(r.ts), "HH:mm:ss")}] ${r.line}`
      );
      setLines(formatted);
    } catch (err) {
      toast.error(
        t("logs.recentError", { message: (err as Error).message }),
      );
    } finally {
      setLoadingRecent(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/60">
            {t("logs.serviceLabel")}
          </label>
          <Select
            value={service}
            onChange={(val) => {
              stopTail();
              setService(val);
              setLines([]);
            }}
            style={{ width: 200 }}
            options={[
              { label: t("logs.services.auth"), value: "auth" },
              { label: t("logs.services.gateway"), value: "gateway" },
            ]}
          />
        </div>
        <Space>
          <Button
            type="primary"
            onClick={startTail}
            disabled={tail}
            loading={tail && esStatus === "connecting"}
          >
            {t("logs.tailStart")}
          </Button>
          <Button onClick={stopTail} disabled={!tail}>
            {t("logs.tailStop")}
          </Button>
          <Button onClick={loadRecent} loading={loadingRecent}>
            {t("logs.recentLoad")}
          </Button>
        </Space>
        <div className="ml-auto flex items-center gap-2">
          <BadgePill variant={statusVariant(esStatus)}>
            {t(`logs.status.${esStatus}`)}
          </BadgePill>
          <span className="text-xs text-ink/50">
            {t("logs.lineCount", { count: lines.length })}
          </span>
        </div>
      </div>

      {esStatus === "closed" && (
        <Alert type="warning" message={t("logs.closedWarning")} showIcon />
      )}

      <LogViewer lines={lines} maxLines={MAX_LINES} />
    </div>
  );
}

function statusVariant(s: EventSourceStatus): BadgeVariant {
  switch (s) {
    case "open":
    case "connecting":
    case "reconnecting":
      return "positive";
    case "error":
    case "closed":
      return "negative";
    default:
      return "neutral";
  }
}
