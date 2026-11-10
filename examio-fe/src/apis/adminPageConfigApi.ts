import { api } from "@/apis/api";

export interface PageConfigItem {
  key: string;
  label: string;
  enabled: boolean;
  updatedAt: string;
}

/** Danh sách trang + trạng thái bật/tắt (admin). */
export async function fetchPageConfigList(): Promise<PageConfigItem[]> {
  const res = await api.get<{ pages: PageConfigItem[] }>("/admin/page-config");
  return res.data.pages ?? [];
}

/** Bật/tắt một trang. */
export async function togglePageConfig(
  key: string,
  enabled: boolean,
): Promise<PageConfigItem> {
  const res = await api.patch<PageConfigItem>(`/admin/page-config/${key}`, {
    enabled,
  });
  return res.data;
}
