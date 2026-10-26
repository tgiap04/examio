import { Dropdown } from "antd";
import { Bell } from "lucide-react";

/** Soft pink waves on the right of the dashboard headers (/k and admin), as in the brand mock. */
export function HeaderWaves() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[45%] overflow-hidden">
      <div className="absolute -right-24 -top-40 h-96 w-[520px] rotate-[-18deg] rounded-[50%] bg-gradient-to-l from-[#fde4e2] via-[#fef1f0] to-transparent opacity-80" />
      <div className="absolute -right-10 -top-24 h-72 w-[380px] rotate-[-24deg] rounded-[50%] border-l-[28px] border-[#fdecea]/90" />
    </div>
  );
}

/**
 * Notification bell. There is no notification backend yet, so it shows no count (never a made-up one) and opens
 * an empty state; wire a real count here once notifications exist.
 */
export function NotificationBell() {
  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      popupRender={() => (
        <div role="dialog" aria-label="Thông báo" className="w-80 rounded-2xl border border-hairline bg-canvas p-4 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
          <p className="text-[15px] font-semibold text-ink">Thông báo</p>
          <div className="mt-3 flex flex-col items-center gap-2 rounded-xl bg-surface-soft px-4 py-6 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand-strong">
              <Bell className="h-5 w-5" />
            </span>
            <p className="text-[13px] font-medium text-ink">Chưa có thông báo</p>
            <p className="text-xs text-muted-foreground">Thông báo về bài thi, phòng học và tài liệu sẽ hiện ở đây.</p>
          </div>
        </div>
      )}
    >
      <button
        type="button"
        aria-label="Thông báo"
        className="grid h-11 w-11 place-items-center rounded-full text-body transition-colors hover:bg-surface-soft hover:text-ink"
      >
        <Bell className="h-6 w-6" strokeWidth={1.75} />
      </button>
    </Dropdown>
  );
}

/** Classes shared by the fixed/sticky dashboard header bars. */
export const dashboardHeaderClass = "overflow-hidden border-b border-hairline bg-canvas/90 backdrop-blur-xl";
