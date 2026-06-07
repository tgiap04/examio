import { useState } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Radio,
  Button,
} from "antd";
import { useTranslation } from "react-i18next";
import {
  refundApi,
  creditApi,
  setTierApi,
  RefundBody,
  CreditBody,
  SetTierBody,
} from "@/apis/adminApi";
import { useAdminStore } from "@/stores/useAdminStore";
import { toast } from "@/components/antd/toast";

export type FinanceActionType = "refund" | "credit" | "tier";

interface FinanceActionModalProps {
  type: FinanceActionType;
  open: boolean;
  onClose: () => void;
}

interface CommonFields {
  reason: string;
}

type RefundForm = CommonFields & { paymentId: string };
type CreditForm = CommonFields & {
  userId: number;
  amount: number;
  direction: "ADD" | "SUBTRACT";
};
type TierForm = CommonFields & {
  userId: number;
  tier: number;
  billingCycle: "monthly" | "yearly";
};

const TIER_OPTIONS = [
  { label: "Tier 0 - Free", value: 0 },
  { label: "Tier 1 - Basic", value: 1 },
  { label: "Tier 2 - Pro", value: 2 },
  { label: "Tier 3 - Premium", value: 3 },
];

export function FinanceActionModal({
  type,
  open,
  onClose,
}: FinanceActionModalProps) {
  const { t } = useTranslation("admin");
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState<"ADD" | "SUBTRACT">("ADD");

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  const submit = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      if (type === "refund") {
        const body: RefundBody = {
          paymentId: values.paymentId as string,
          reason: values.reason as string,
        };
        await refundApi(body);
      } else if (type === "credit") {
        const body: CreditBody = {
          userId: values.userId as number,
          amount: Math.abs(values.amount as number),
          reason: values.reason as string,
        };
        if (direction === "SUBTRACT") {
          body.amount = -body.amount;
        }
        await creditApi(body);
      } else {
        const body: SetTierBody = {
          userId: values.userId as number,
          tier: values.tier as number,
          reason: values.reason as string,
        };
        await setTierApi(body);
      }

      const store = useAdminStore.getState();
      store.invalidateOverview();
      store.invalidateSeries("revenue");
      store.invalidateAudit();

      toast.success(t(`finance.actions.${type}.success`));
      form.resetFields();
      onClose();
    } catch (err) {
      toast.error(
        t("finance.actions.error", { message: (err as Error).message }),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    try {
      const values = await form.validateFields();
      const danger = type === "refund" || direction === "SUBTRACT";

      Modal.confirm({
        title: t("finance.confirm.title"),
        content: t(`finance.confirm.${type}`),
        okText: t("finance.confirm.ok"),
        cancelText: t("finance.confirm.cancel"),
        okButtonProps: { danger, loading },
        onOk: () => submit(values),
      });
    } catch {
      // form validation already shows errors
    }
  };

  const renderTypeFields = () => {
    if (type === "refund") {
      return (
        <Form.Item
          name="paymentId"
          label={t("finance.fields.paymentId")}
          rules={[{ required: true, message: t("finance.validation.required") }]}
        >
          <Input placeholder="pay_..." />
        </Form.Item>
      );
    }
    if (type === "credit") {
      return (
        <>
          <Form.Item
            name="userId"
            label={t("finance.fields.userId")}
            rules={[
              { required: true, message: t("finance.validation.required") },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              placeholder="123"
              min={1}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={t("finance.fields.amount")}
            rules={[
              { required: true, message: t("finance.validation.required") },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              min={1}
              step={1}
            />
          </Form.Item>
          <Form.Item label={t("finance.fields.direction")}>
            <Radio.Group
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              options={[
                {
                  label: t("finance.fields.add"),
                  value: "ADD",
                },
                {
                  label: t("finance.fields.subtract"),
                  value: "SUBTRACT",
                },
              ]}
            />
          </Form.Item>
        </>
      );
    }
    return (
      <>
        <Form.Item
          name="userId"
          label={t("finance.fields.userId")}
          rules={[
            { required: true, message: t("finance.validation.required") },
          ]}
        >
          <InputNumber style={{ width: "100%" }} min={1} />
        </Form.Item>
        <Form.Item
          name="tier"
          label={t("finance.fields.tier")}
          rules={[
            { required: true, message: t("finance.validation.required") },
          ]}
        >
          <Select options={TIER_OPTIONS} placeholder={t("finance.fields.tier")} />
        </Form.Item>
        <Form.Item
          name="billingCycle"
          label={t("finance.fields.billingCycle")}
          initialValue="monthly"
          rules={[
            { required: true, message: t("finance.validation.required") },
          ]}
        >
          <Select
            options={[
              { label: t("finance.fields.monthly"), value: "monthly" },
              { label: t("finance.fields.yearly"), value: "yearly" },
            ]}
          />
        </Form.Item>
      </>
    );
  };

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      title={t(`finance.modalTitle.${type}`)}
      footer={null}
      destroyOnClose
      width={520}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{ direction: "ADD", billingCycle: "monthly" }}
      >
        {renderTypeFields()}
        <Form.Item
          name="reason"
          label={t("finance.fields.reason")}
          rules={[
            { required: true, message: t("finance.validation.reasonRequired") },
            { min: 10, message: t("finance.validation.reasonMin") },
            { max: 500, message: t("finance.validation.reasonMax") },
          ]}
        >
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            placeholder={t("finance.fields.reasonPlaceholder")}
          />
        </Form.Item>
        <div className="flex justify-end gap-2">
          <Button onClick={handleCancel}>{t("common.cancel")}</Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            {t("finance.continue")}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
