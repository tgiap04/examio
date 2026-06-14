import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Skeleton,
  Alert,
  Switch,
  Space,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { toast } from "@/components/antd/toast";
import { storeCache } from "@/lib/storeCache";
import {
  adminListCategoriesApi,
  adminCreateCategoryApi,
  adminUpdateCategoryApi,
  adminDeleteCategoryApi,
  type CreateCategoryBody,
  type UpdateCategoryBody,
} from "@/apis/wordFamilyApi";
import type { WordFamilyCategory } from "@/types/wordFamily";

export default function AdminWordFamilyPage() {
  const { t } = useTranslation("admin");
  const [categories, setCategories] = useState<WordFamilyCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminListCategoriesApi();
      setCategories(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCategories();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (cat: WordFamilyCategory) => {
    setEditingId(cat.id);
    form.setFieldsValue({
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      imageUrl: cat.imageUrl,
      order: cat.order,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingId) {
        const body: UpdateCategoryBody = {
          name: values.name,
          description: values.description || undefined,
          imageUrl: values.imageUrl || undefined,
          order: values.order,
          isActive: values.isActive,
        };
        await adminUpdateCategoryApi(editingId, body);
        toast.success("Cập nhật danh mục thành công!");
      } else {
        const body: CreateCategoryBody = {
          name: values.name,
          slug: values.slug,
          description: values.description || undefined,
          imageUrl: values.imageUrl || undefined,
          order: values.order,
        };
        await adminCreateCategoryApi(body);
        toast.success("Tạo danh mục thành công!");
      }

      setModalOpen(false);
      storeCache.invalidate("wf:categories");
      void fetchCategories();
    } catch (err) {
      if ((err as any)?.errorFields) return; // form validation
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminDeleteCategoryApi(id);
      toast.success("Đã xóa danh mục!");
      storeCache.invalidate("wf:categories");
      void fetchCategories();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  /** Generate a URL-safe slug from Vietnamese category name */
  const autoSlug = (name: string) => {
    const nfd = name.toLowerCase().normalize("NFD");
    const stripped = nfd.replace(/\p{M}/gu, "");
    return stripped
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .trim();
  };

  const columns = [
    {
      title: "Tên",
      dataIndex: "name",
      key: "name",
      render: (name: string) => (
        <span className="font-medium">{name}</span>
      ),
    },
    {
      title: "Slug",
      dataIndex: "slug",
      key: "slug",
      render: (slug: string) => (
        <code className="rounded bg-canvas px-1.5 py-0.5 text-xs">
          {slug}
        </code>
      ),
    },
    {
      title: "Thứ tự",
      dataIndex: "order",
      key: "order",
      width: 80,
      align: "center" as const,
    },
    {
      title: "Active",
      dataIndex: "isActive",
      key: "isActive",
      width: 80,
      align: "center" as const,
      render: (active: boolean) => (
        <span className={active ? "text-green-600" : "text-red-500"}>
          {active ? "✓" : "✗"}
        </span>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 120,
      render: (_: unknown, record: WordFamilyCategory) => (
        <Space size="small">
          <Tooltip title="Sửa">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Xóa danh mục này?"
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Tooltip title="Xóa">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-normal tracking-tight text-ink">
            {t("pages.wordFamily.title", "Word Family Categories")}
          </h1>
          <p className="text-sm text-ink/60">
            {t("pages.wordFamily.subtitle", "Quản lý danh mục từ vựng")}
          </p>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void fetchCategories()}
            loading={loading}
          >
            Làm mới
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Thêm danh mục
          </Button>
        </Space>
      </div>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          action={
            <Button size="small" onClick={() => void fetchCategories()}>
              Thử lại
            </Button>
          }
        />
      )}

      {loading && categories.length === 0 ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <Table
          dataSource={categories}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="middle"
        />
      )}

      <Modal
        title={editingId ? "Sửa danh mục" : "Thêm danh mục mới"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText={editingId ? "Cập nhật" : "Tạo"}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="name"
            label="Tên danh mục"
            rules={[{ required: true, message: "Nhập tên danh mục" }]}
          >
            <Input
              onChange={(e) => {
                if (!editingId) {
                  form.setFieldsValue({ slug: autoSlug(e.target.value) });
                }
              }}
            />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Slug"
            rules={[
              { required: true, message: "Nhập slug" },
              {
                pattern: /^[a-z0-9-]+$/,
                message: "Chỉ chứa lowercase, số và dấu gạch ngang",
              },
            ]}
          >
            <Input disabled={!!editingId} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="imageUrl" label="Ảnh URL">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="order" label="Thứ tự" initialValue={0}>
            <InputNumber min={0} max={999} />
          </Form.Item>
          {editingId && (
            <Form.Item
              name="isActive"
              label="Active"
              valuePropName="checked"
              initialValue={true}
            >
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
