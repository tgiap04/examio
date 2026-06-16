import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useWordFamilyStore } from "@/stores/useWordFamilyStore";
import { Skeleton, Button } from "antd";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/antd/breadcrumb";

export default function WordFamilyCategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const {
    currentCategory,
    loadingRootWords,
    generating,
    error,
    fetchRootWords,
    generateWordFamily,
  } = useWordFamilyStore();

  useEffect(() => {
    if (slug) void fetchRootWords(slug);
  }, [slug, fetchRootWords]);

  const handleGenerate = async () => {
    if (!slug) return;
    const ok = await generateWordFamily({ categorySlug: slug });
    if (ok && slug) void fetchRootWords(slug, true);
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <section className="relative mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
      <Breadcrumb className="mb-2">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/k">Trang chủ</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/k/word-family">Từ vựng</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{currentCategory?.category?.name ?? slug}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-normal tracking-tight text-ink">
            {currentCategory?.category?.name ?? slug}
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            {currentCategory?.total ?? 0} từ gốc
          </p>
        </div>
        <Button type="primary" loading={generating} onClick={handleGenerate}>
          Tạo thêm từ gốc
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loadingRootWords && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} active paragraph={false} />
          ))}
        </div>
      )}

      {!loadingRootWords &&
        currentCategory?.rootWords &&
        currentCategory.rootWords.length === 0 && (
          <p className="text-sm text-ink/50">
            Chưa có từ gốc nào. Nhấn "Tạo thêm từ gốc" để bắt đầu.
          </p>
        )}

      <div className="flex flex-wrap gap-2">
        {currentCategory?.rootWords?.map((rw) => (
          <Link
            key={rw.id}
            to={`/k/word-family/${slug}/${rw.rootWord}`}
            className="rounded-lg border border-hairline bg-surface-card px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-coral/30 hover:text-coral"
          >
            {rw.rootWord}
          </Link>
        ))}
      </div>
      </section>
    </div>
  );
}
