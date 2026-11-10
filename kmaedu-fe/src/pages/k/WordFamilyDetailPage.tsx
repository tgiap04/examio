import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  TreeView,
  ListView,
  CreateFlashcardModal,
} from "@/components/k/word-family";
import { useWordFamilyStore } from "@/stores/useWordFamilyStore";
import { toast } from "@/components/antd/toast";
import { useCan } from "@/hooks/useCan";
import { WORD_FAMILY_ACTION_PERMISSIONS } from "@/lib/rbac/nav-items";
import { Button, Skeleton, Spin } from "antd";
import {
  SaveOutlined,
  ApartmentOutlined,
  UnorderedListOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/antd/breadcrumb";

export default function WordFamilyDetailPage() {
  const { slug, rootWord } = useParams<{
    slug: string;
    rootWord: string;
  }>();
  const {
    currentWordFamily,
    loadingDetail,
    error,
    savedIds,
    regeneratingKey,
    fetchWordFamily,
    fetchSaved,
    saveWordFamily,
    generateWordFamilyForRoot,
    checkRootGenerationStatus,
    abandonRootGeneration,
  } = useWordFamilyStore();

  // Root-scoped: only this exact root's regenerate job drives the UI.
  const generating =
    !!slug && !!rootWord && regeneratingKey === `${slug}:${rootWord}`;

  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const [expandedWords, setExpandedWords] = useState<Set<number>>(() => new Set());
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const [showFlashcardModal, setShowFlashcardModal] = useState(false);
  const canGenerate = useCan(WORD_FAMILY_ACTION_PERMISSIONS.generate);
  const canSave = useCan(WORD_FAMILY_ACTION_PERMISSIONS.save);
  const canToFlashcard = useCan(WORD_FAMILY_ACTION_PERMISSIONS.toFlashcard);

  useEffect(() => {
    if (slug && rootWord) {
      void fetchWordFamily(slug, rootWord);
      if (canSave) void fetchSaved();
      // Resume the generating UI if a job for THIS root is already running
      // (e.g. after a page reload).
      void checkRootGenerationStatus(slug, rootWord);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand selectors return stable refs
  }, [slug, rootWord]);

  // While a generation job runs, poll its status; when it clears, refetch the
  // detail so the freshly generated words appear. Self-rescheduling timeout
  // (not setInterval) so a slow response can never overlap the next tick.
  useEffect(() => {
    if (!slug || !rootWord || !generating) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let elapsedMs = 0;
    const POLL_INTERVAL_MS = 5000;
    const MAX_WAIT_MS = 11 * 60 * 1000; // AI times out server-side at ~10 min

    const tick = async () => {
      const stillGenerating = await checkRootGenerationStatus(slug, rootWord);
      if (cancelled) return;
      if (!stillGenerating) {
        await fetchWordFamily(slug, rootWord, true);
        if (!cancelled) toast.success(`Đã sinh từ con cho "${rootWord}"!`);
        return;
      }
      elapsedMs += POLL_INTERVAL_MS;
      if (elapsedMs >= MAX_WAIT_MS) {
        abandonRootGeneration(slug, rootWord);
        return;
      }
      timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
    };

    timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand selectors return stable refs
  }, [slug, rootWord, generating]);

  const toggleExpand = (idx: number) => {
    setExpandedWords((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleSelect = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!currentWordFamily) return;
    if (selectedIndices.size === currentWordFamily.words.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(
        new Set(currentWordFamily.words.map((_, i) => i)),
      );
    }
  };

  const handleSave = async () => {
    if (!currentWordFamily) return;
    const ok = await saveWordFamily(currentWordFamily.id);
    if (ok) toast.success("Đã lưu vào bộ sưu tập!");
    else toast.error("Lưu thất bại");
  };

  const handleGenerate = async () => {
    if (!slug || !rootWord || generating) return;
    const ok = await generateWordFamilyForRoot(slug, rootWord);
    if (!ok) toast.error("Không thể bắt đầu sinh từ con. Vui lòng thử lại.");
    // On success, the polling effect refetches + toasts when the job completes.
  };

  const words = currentWordFamily?.words ?? [];
  const isSaved = currentWordFamily
    ? savedIds.has(currentWordFamily.id)
    : false;

  return (
    <div className="relative min-h-screen bg-canvas text-ink">
      <section className="relative mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-10">
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
              <BreadcrumbLink asChild>
                <Link to={`/k/word-family/${slug}`}>{slug}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{rootWord}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral/10 font-display text-lg font-semibold text-coral">
              {rootWord?.charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="font-display text-2xl font-medium tracking-tight text-ink md:text-3xl">
                {rootWord}
              </h1>
              <p className="text-sm text-ink/55">
                {words.length} từ vựng &middot; {slug}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle — cream segmented control */}
            <div className="flex rounded-lg bg-surface-card p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("tree")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  viewMode === "tree"
                    ? "bg-canvas text-ink shadow-sm"
                    : "text-ink/50 hover:text-ink"
                }`}
              >
                <ApartmentOutlined className="mr-1" />
                Tree
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  viewMode === "list"
                    ? "bg-canvas text-ink shadow-sm"
                    : "text-ink/50 hover:text-ink"
                }`}
              >
                <UnorderedListOutlined className="mr-1" />
                List
              </button>
            </div>

            {canGenerate && (
              <Button
                icon={<ThunderboltOutlined />}
                onClick={handleGenerate}
                loading={generating}
              >
                {generating ? "Đang sinh..." : "Sinh lại từ con"}
              </Button>
            )}

            {canSave && (
              <Button
                icon={<SaveOutlined />}
                onClick={handleSave}
                disabled={isSaved || generating}
              >
                {isSaved ? "Đã lưu" : "Lưu"}
              </Button>
            )}

            {canToFlashcard && viewMode === "list" && selectedIndices.size > 0 && (
              <Button
                type="primary"
                onClick={() => setShowFlashcardModal(true)}
              >
                Tạo Flashcard ({selectedIndices.size})
              </Button>
            )}
          </div>
        </div>

        {error && !generating && (
          <div className="rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-sm text-[#c64545]">
            {error}
          </div>
        )}

        {generating && (
          <div className="flex items-center gap-3 rounded-lg border border-coral/30 bg-coral/5 px-4 py-3.5 text-sm text-ink">
            <Spin size="small" />
            <span>
              Đang sinh từ con cho &ldquo;{rootWord}&rdquo;, vui lòng đợi trong
              giây lát...
            </span>
          </div>
        )}

        {loadingDetail && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} active paragraph={{ rows: 1 }} />
            ))}
          </div>
        )}

        {!loadingDetail && !generating && words.length === 0 && !error && (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-hairline bg-surface-soft/60 px-6 py-14 text-center">
            <p className="text-sm text-ink/55">
              Chưa có từ con cho từ gốc &ldquo;{rootWord}&rdquo;.
            </p>
            {canGenerate && (
              <Button
                type="primary"
                size="large"
                icon={<ThunderboltOutlined />}
                onClick={handleGenerate}
                loading={generating}
              >
                {generating ? "Đang sinh..." : `Sinh từ con cho "${rootWord}"`}
              </Button>
            )}
          </div>
        )}

      {!loadingDetail && words.length > 0 && viewMode === "tree" && (
        <TreeView rootWord={rootWord!} words={words} />
      )}

      {!loadingDetail && words.length > 0 && viewMode === "list" && (
        <ListView
          words={words}
          selectedIndices={selectedIndices}
          expandedWords={expandedWords}
          onToggleSelect={toggleSelect}
          onToggleExpand={toggleExpand}
          onSelectAll={toggleSelectAll}
          allSelected={selectedIndices.size === words.length}
        />
      )}

      <CreateFlashcardModal
        open={showFlashcardModal}
        wordFamilyId={currentWordFamily?.id ?? ""}
        rootWord={rootWord ?? ""}
        selectedCount={selectedIndices.size}
        selectedIndices={[...selectedIndices]}
        onClose={() => setShowFlashcardModal(false)}
      />
      </section>
    </div>
  );
}
