import { create } from "zustand";
import { fetchPages } from "@/apis/configApi";

interface PageConfigState {
  /** Map { [pageKey]: enabled }. Thiếu key = mặc định bật (default-on). */
  pages: Record<string, boolean>;
  loaded: boolean;
  /** Ghi đè toàn bộ map (dùng cho fetch ban đầu và SSE push). */
  setPages: (map: Record<string, boolean>) => void;
  /** true nếu trang đang bật. Default-on: chỉ tắt khi map[key] === false. */
  isEnabled: (key: string) => boolean;
  /** Nạp map từ server 1 lần. Fail-open nếu lỗi (giữ tất cả bật). */
  loadPages: () => Promise<void>;
}

export const usePageConfigStore = create<PageConfigState>((set, get) => ({
  pages: {},
  loaded: false,

  setPages: (map) => set({ pages: map, loaded: true }),

  isEnabled: (key) => get().pages[key] !== false,

  loadPages: async () => {
    try {
      const map = await fetchPages();
      set({ pages: map, loaded: true });
    } catch {
      // Fail-open: giữ map rỗng → mọi trang mặc định bật, không chặn user.
      set({ loaded: true });
    }
  },
}));
