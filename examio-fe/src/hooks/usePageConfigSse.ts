import { useEffect } from "react";
import { openConfigStream } from "@/apis/configApi";
import { usePageConfigStore } from "@/stores/usePageConfigStore";
import { pathnameToPageKey } from "@/lib/pathname-to-page-key";
import { toast } from "@/components/antd/toast";

/**
 * Mở 1 kết nối SSE tới /config/stream trong suốt vòng đời KLayout.
 * Mỗi lần admin toggle, cập nhật store (sidebar + FeatureRoute tự re-render).
 *
 * Nếu user đang ở đúng trang vừa bị tắt: FeatureRoute sẽ tự render 404 (reactive),
 * hook chỉ cần báo toast cho người dùng biết lý do.
 *
 * Phải mount trong RouterProvider context (KLayout) vì cần đọc pathname.
 */
export function usePageConfigSse() {
  const setPages = usePageConfigStore((s) => s.setPages);

  useEffect(() => {
    const cleanup = openConfigStream((map) => {
      const currentKey = pathnameToPageKey(window.location.pathname);
      const justDisabled = currentKey && map[currentKey] === false;

      setPages(map);

      if (justDisabled) {
        toast.warning("Trang này vừa bị quản trị viên tắt.");
      }
    });

    return cleanup;
  }, [setPages]);
}
