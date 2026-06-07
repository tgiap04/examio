import { useState, useEffect } from "react";
import { Drawer, Descriptions, Tag, Skeleton, Empty, Alert } from "antd";
import { useTranslation } from "react-i18next";
import { getUserApi } from "@/apis/adminApi";

interface UserDetailDrawerProps {
  userId: number | null;
  onClose: () => void;
}

interface UserDetailResponse {
  id: number;
  email: string;
  username: string;
  name: string;
  isAdmin: boolean;
  isVerified: boolean;
  isBanned: boolean;
  createdAt: string;
  wallet?: { balance: number };
  subscription?: {
    tier: number;
    billingCycle: "monthly" | "yearly";
    isActive: boolean;
    nextPaymentDate?: string;
  };
  lastSession?: {
    device?: string;
    ip?: string;
    lastActive?: string;
  };
}

export function UserDetailDrawer({ userId, onClose }: UserDetailDrawerProps) {
  const { t } = useTranslation("admin");
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<UserDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId === null) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    getUserApi(userId)
      .then((res) => {
        if (mounted) setData(res as UserDetailResponse);
      })
      .catch((err) => {
        if (mounted) setError((err as Error).message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const handleClose = () => {
    setOpen(false);
    setTimeout(onClose, 200);
  };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width={600}
      placement="right"
      title={t("users.detail.title")}
      destroyOnClose
    >
      {loading && <Skeleton active paragraph={{ rows: 8 }} />}
      {error && (
        <Alert type="error" message={t("users.detail.loadError")} showIcon />
      )}
      {!loading && !error && !data && (
        <Empty description={t("users.detail.loadError")} />
      )}
      {data && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase text-ink/60">
              {t("users.detail.basicInfo")}
            </h3>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t("users.columns.email")}>
                {data.email}
              </Descriptions.Item>
              <Descriptions.Item label={t("users.columns.username")}>
                {data.username}
              </Descriptions.Item>
              <Descriptions.Item label={t("users.columns.name")}>
                {data.name}
              </Descriptions.Item>
              <Descriptions.Item label={t("users.columns.isAdmin")}>
                <Tag color={data.isAdmin ? "geekblue" : "default"}>
                  {data.isAdmin ? t("common.yes") : t("common.no")}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("users.columns.isVerified")}>
                <Tag color={data.isVerified ? "green" : "default"}>
                  {data.isVerified ? t("common.yes") : t("common.no")}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("users.columns.isBanned")}>
                <Tag color={data.isBanned ? "red" : "default"}>
                  {data.isBanned ? t("common.yes") : t("common.no")}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("users.columns.createdAt")}>
                {new Date(data.createdAt).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase text-ink/60">
              {t("users.detail.wallet")}
            </h3>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t("users.detail.balance")}>
                {data.wallet?.balance?.toLocaleString() ?? "0"}
              </Descriptions.Item>
            </Descriptions>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase text-ink/60">
              {t("users.detail.subscription")}
            </h3>
            {data.subscription
              ? (
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label={t("users.detail.tier")}>
                    {data.subscription.tier}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("users.detail.billingCycle")}>
                    {data.subscription.billingCycle}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("users.detail.active")}>
                    <Tag color={data.subscription.isActive ? "green" : "default"}>
                      {data.subscription.isActive
                        ? t("common.yes")
                        : t("common.no")}
                    </Tag>
                  </Descriptions.Item>
                  {data.subscription.nextPaymentDate && (
                    <Descriptions.Item
                      label={t("users.detail.nextPaymentDate")}
                    >
                      {new Date(data.subscription.nextPaymentDate).toLocaleString()}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              )
              : <Empty description={t("users.detail.noSubscription")} />}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase text-ink/60">
              {t("users.detail.lastSession")}
            </h3>
            {data.lastSession
              ? (
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label={t("users.detail.device")}>
                    {data.lastSession.device ?? "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("users.detail.ip")}>
                    {data.lastSession.ip ?? "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("users.detail.lastActive")}>
                    {data.lastSession.lastActive
                      ? new Date(data.lastSession.lastActive).toLocaleString()
                      : "—"}
                  </Descriptions.Item>
                </Descriptions>
              )
              : <Empty description={t("users.detail.noSession")} />}
          </section>
        </div>
      )}
    </Drawer>
  );
}
