import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useWordFamilyStore } from "@/stores/useWordFamilyStore";
import { Skeleton, Button, Spin } from "antd";
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
    generatingSlug,
    error,
    fetchRootWords,
    generateWordFamily,
    checkGenerationStatus,
    abandonGeneration,
  } = useWordFamilyStore();

  // Slug-scoped: only "generating" when the running job belongs to this category.
  const generating = generatingSlug === slug;

  useEffect(() => {
    if (!slug) return;
    void fetchRootWords(slug);
    // Detect a generation job already in progress (e.g. after a page reload)
    // and resume the generating UI immediately.
    void checkGenerationStatus(slug);
  }, [slug, fetchRootWords, checkGenerationStatus]);

  // While a job is in progress, poll its status; when it clears, refresh roots.
  // Self-rescheduling timeout (not setInterval) so a slow response can never
  // overlap the next tick and produce out-of-order writes.
  useEffect(() => {
    if (!slug || !generating) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let elapsedMs = 0;
    const POLL_INTERVAL_MS = 5000;
    const MAX_WAIT_MS = 11 * 60 * 1000; // AI generation times out server-side at 10 min

    const tick = async () => {
      const stillGenerating = await checkGenerationStatus(slug);
      if (cancelled) return;
      if (!stillGenerating) {
        void fetchRootWords(slug, true);
        return;
      }
      elapsedMs += POLL_INTERVAL_MS;
      if (elapsedMs >= MAX_WAIT_MS) {
        // Lock likely orphaned by a server restart mid-generation — stop waiting.
        abandonGeneration(slug);
        return;
      }
      timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
    };

    timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [slug, generating, checkGenerationStatus, fetchRootWords, abandonGeneration]);

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

      {generating && (
        <div className="flex items-center gap-3 rounded-lg border border-coral/30 bg-coral/5 p-3 text-sm text-ink">
          <Spin size="small" />
          <span>Đang sinh word family, vui lòng đợi trong giây lát...</span>
        </div>
      )}

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
