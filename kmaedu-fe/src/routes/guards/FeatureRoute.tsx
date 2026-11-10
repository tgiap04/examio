import type { PropsWithChildren } from "react";
import { usePageConfigStore } from "@/stores/usePageConfigStore";
import type { PageKey } from "@/lib/page-keys";
import { NotFound } from "@/components/common/NotFound";

interface FeatureRouteProps extends PropsWithChildren {
  pageKey: PageKey;
}

/**
 * Chặn truy cập trực tiếp vào trang đã bị admin tắt → render 404 ngay ở client,
 * KHÔNG gọi API (không lộ dữ liệu). Default-on: chỉ chặn khi map[key] === false.
 *
 * Subscribe thẳng vào giá trị boolean dẫn xuất từ `pages` để component
 * re-render khi SSE đẩy trạng thái mới (nếu đang xem trang vừa bị tắt → 404).
 */
export function FeatureRoute({ pageKey, children }: FeatureRouteProps) {
  const enabled = usePageConfigStore((s) => s.pages[pageKey] !== false);
  if (!enabled) {
    return <NotFound />;
  }
  return <>{children}</>;
}
