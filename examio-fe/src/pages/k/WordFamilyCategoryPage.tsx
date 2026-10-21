import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useWordFamilyStore } from "@/stores/useWordFamilyStore";
import { Button, Spin } from "antd";
import { useCan } from "@/hooks/useCan";
import { WORD_FAMILY_ACTION_PERMISSIONS } from "@/lib/rbac/nav-items";
import { ArrowUpRight } from "lucide-react";
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
  const canGenerate = useCan(WORD_FAMILY_ACTION_PERMISSIONS.generate);
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

  const rootWords = currentCategory?.rootWords ?? [];
  const showEmpty =
    !loadingRootWords && !generating && rootWords.length === 0;

  return (
    <div className="relative min-h-screen bg-canvas text-ink">
      <section className="relative mx-auto max-w-7xl space-y-8 px-4 py-6 md:py-10">
        <Breadcrumb>
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
              <BreadcrumbPage>
                {currentCategory?.category?.name ?? slug}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3">
            <h1 className="font-display text-3xl font-medium tracking-tight text-ink md:text-4xl">
              {currentCategory?.category?.name ?? slug}
            </h1>
            {currentCategory?.category?.description && (
              <p className="max-w-2xl text-[15px] leading-relaxed text-ink/60">
                {currentCategory.category.description}
              </p>
            )}
            <span className="inline-flex items-center rounded-pill bg-surface-card px-3 py-1 text-[13px] font-medium text-ink/70">
              {currentCategory?.total ?? 0} từ gốc
            </span>
          </div>
          {canGenerate && (
            <Button
              type="primary"
              size="large"
              loading={generating}
              onClick={handleGenerate}
            >
              Tạo thêm từ gốc
            </Button>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-sm text-[#c64545]">
            {error}
          </div>
        )}

        {generating && (
          <div className="flex items-center gap-3 rounded-lg border border-coral/30 bg-coral/5 px-4 py-3.5 text-sm text-ink">
            <Spin size="small" />
            <span>Đang sinh word family, vui lòng đợi trong giây lát...</span>
          </div>
        )}

        {loadingRootWords && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[68px] animate-pulse rounded-lg border border-hairline bg-surface-card"
              />
            ))}
          </div>
        )}

        {showEmpty && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-hairline bg-surface-soft/60 px-6 py-16 text-center">
            <p className="font-display text-lg font-medium text-ink">
              Chưa có từ gốc nào
            </p>
            <p className="max-w-sm text-sm text-ink/55">
              {canGenerate
                ? "Nhấn \"Tạo thêm từ gốc\" để AI sinh nhóm từ vựng đầu tiên cho danh mục này."
                : "Giáo viên sẽ bổ sung từ vựng cho danh mục này."}
            </p>
          </div>
        )}

        {!loadingRootWords && rootWords.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {rootWords.map((rw) => (
              <Link
                key={rw.id}
                to={`/k/word-family/${slug}/${rw.rootWord}`}
                className="group flex items-center gap-3 rounded-lg border border-hairline bg-surface-card px-4 py-3.5 transition-colors duration-150 hover:border-coral/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-coral/10 font-display text-sm font-semibold text-coral">
                  {rw.rootWord.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate font-display text-[15px] font-medium text-ink">
                  {rw.rootWord}
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-ink/25 transition-colors duration-150 group-hover:text-coral" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
