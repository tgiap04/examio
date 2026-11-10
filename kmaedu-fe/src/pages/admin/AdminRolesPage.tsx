import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs } from "antd";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { RoleUser } from "@/apis/adminRolesApi";
import { ApiFailure } from "@/lib/quiz-practice/api-failure";
import { errorMessageKey } from "@/lib/admin-roles/role-change-rules";
import { toast } from "@/components/antd/toast";
import { useDebounce } from "@/hooks/useDebounce";
import { useAdminStore } from "@/stores/useAdminStore";
import { useAdminRolesStore } from "@/stores/useAdminRolesStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { PermissionMatrix } from "@/components/admin/roles/PermissionMatrix";
import { RoleChangeDialog, type PendingChange } from "@/components/admin/roles/RoleChangeDialog";
import { RoleChangeHistory } from "@/components/admin/roles/RoleChangeHistory";
import { RoleUserFilters, type RoleFilterValues } from "@/components/admin/roles/RoleUserFilters";
import { RoleUserTable } from "@/components/admin/roles/RoleUserTable";

const LIMIT = 20;
type Tab = "users" | "matrix" | "history";
const TABS: readonly Tab[] = ["users", "matrix", "history"];
const pickRole = (v: string | null): RoleFilterValues["role"] => (v === "STUDENT" || v === "TEACHER" ? v : "all");
const pickAdmin = (v: string | null): RoleFilterValues["admin"] => (v === "yes" || v === "no" ? v : "all");
const positive = (v: string | null) => Math.max(1, Number.parseInt(v ?? "1", 10) || 1);

export default function AdminRolesPage() {
  const { t } = useTranslation("admin");
  const [params, setParams] = useSearchParams();
  const currentUserId = useAuthStore((s) => (s.user?.id != null ? String(s.user.id) : null));

  const tab: Tab = TABS.find((x) => x === params.get("tab")) ?? "users";
  const filters: RoleFilterValues = {
    q: params.get("q") ?? "",
    role: pickRole(params.get("role")),
    admin: pickAdmin(params.get("admin")),
  };
  const page = positive(params.get("page"));
  const historyUser = params.get("user") ?? undefined;
  const historyPage = positive(params.get("hpage"));

  /** URL is the source of truth (shareable, back button); empty values are dropped. */
  const patchParams = useCallback(
    (patch: Record<string, string | null>, replace = false) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === "" || v === "all") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace },
      ),
    [setParams],
  );

  // The search box keeps its own text so typing is instant; the URL follows after 300 ms.
  const [search, setSearch] = useState(filters.q);
  const debouncedSearch = useDebounce(search, 300);
  useEffect(() => {
    if (debouncedSearch !== filters.q) patchParams({ q: debouncedSearch, page: null }, true);
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setSearch(filters.q), [filters.q]);

  const query = useMemo(
    () => ({
      q: filters.q || undefined,
      role: filters.role === "all" ? undefined : filters.role,
      isSystemAdmin: filters.admin === "all" ? undefined : filters.admin === "yes",
      page,
      limit: LIMIT,
    }),
    [filters.q, filters.role, filters.admin, page],
  );

  const users = useAdminRolesStore((s) => s.users);
  useEffect(() => {
    if (tab === "users") void useAdminRolesStore.getState().fetchUsers(query);
  }, [tab, query]);
  const refetchUsers = () => useAdminRolesStore.getState().fetchUsers(query, true);

  const [pending, setPending] = useState<PendingChange | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const confirm = async (reason: string) => {
    if (!pending || submitting) return;
    setSubmitting(true);
    try {
      await useAdminRolesStore.getState().applyChange(pending.user, pending.change, reason);
      // Other admin screens show the same accounts: drop their caches too.
      const admin = useAdminStore.getState();
      admin.invalidateUsers();
      admin.invalidateAudit();
      admin.invalidateAdminList();
      toast.success(t("roles.toast.updated"));
      setPending(null);
      await refetchUsers();
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : null;
      const { key, refetch } = errorMessageKey(failure?.status, failure?.code);
      toast.error(t(key));
      if (key !== "roles.errors.default") setPending(null);
      if (refetch) await refetchUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    patchParams({ q: null, role: null, admin: null, page: null });
  };
  const openHistory = (row: RoleUser) => patchParams({ tab: "history", user: row.id, hpage: null });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-normal tracking-tight text-ink">{t("pages.roles.title")}</h1>
        <p className="text-sm text-ink/60">{t("pages.roles.subtitle")}</p>
      </div>

      <Tabs
        activeKey={tab}
        onChange={(key) => patchParams({ tab: key === "users" ? null : key })}
        items={[
          {
            key: "users",
            label: t("roles.tabs.users"),
            children: (
              <div className="space-y-4">
                <RoleUserFilters
                  values={{ ...filters, q: search }}
                  onChange={(patch) => {
                    if (patch.q !== undefined) setSearch(patch.q);
                    const { q: _q, ...rest } = patch;
                    if (Object.keys(rest).length) patchParams({ ...rest, page: null });
                  }}
                  onClear={clearFilters}
                />
                <RoleUserTable
                  data={users.data}
                  loading={users.loading}
                  error={users.error}
                  currentUserId={currentUserId}
                  page={page}
                  limit={LIMIT}
                  onRequestChange={(user, change) => setPending({ user, change })}
                  onHistory={openHistory}
                  onPage={(p) => patchParams({ page: String(p) })}
                  onRetry={() => void refetchUsers()}
                  onClearFilters={clearFilters}
                />
              </div>
            ),
          },
          { key: "matrix", label: t("roles.tabs.matrix"), children: tab === "matrix" ? <PermissionMatrix /> : null },
          {
            key: "history",
            label: t("roles.tabs.history"),
            children:
              tab === "history" ? (
                <RoleChangeHistory
                  userId={historyUser}
                  page={historyPage}
                  onPage={(p) => patchParams({ hpage: String(p) })}
                  onClearUser={() => patchParams({ user: null, hpage: null })}
                />
              ) : null,
          },
        ]}
      />

      <RoleChangeDialog pending={pending} submitting={submitting} onConfirm={confirm} onCancel={() => setPending(null)} />
    </div>
  );
}
