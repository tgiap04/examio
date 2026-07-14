import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  TreeView,
  ListView,
  CreateFlashcardModal,
} from "@/components/k/word-family";
import { useWordFamilyStore } from "@/stores/useWordFamilyStore";
import { toast } from "@/components/antd/toast";
import { Button, Skeleton } from "antd";
import {
  SaveOutlined,
  ApartmentOutlined,
  UnorderedListOutlined,
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
    fetchWordFamily,
    fetchSaved,
    saveWordFamily,
  } = useWordFamilyStore();

  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const [expandedWords, setExpandedWords] = useState<Set<number>>(() => new Set());
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const [showFlashcardModal, setShowFlashcardModal] = useState(false);

  useEffect(() => {
    if (slug && rootWord) {
      void fetchWordFamily(slug, rootWord);
      void fetchSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand selectors return stable refs
  }, [slug, rootWord]);

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

            <Button
              icon={<SaveOutlined />}
              onClick={handleSave}
              disabled={isSaved}
            >
              {isSaved ? "Đã lưu" : "Lưu"}
            </Button>

            {viewMode === "list" && selectedIndices.size > 0 && (
              <Button
                type="primary"
                onClick={() => setShowFlashcardModal(true)}
              >
                Tạo Flashcard ({selectedIndices.size})
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-sm text-[#c64545]">
            {error}
          </div>
        )}

        {loadingDetail && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} active paragraph={{ rows: 1 }} />
            ))}
          </div>
        )}

        {!loadingDetail && words.length === 0 && !error && (
          <div className="rounded-xl border border-dashed border-hairline bg-surface-soft/60 px-6 py-14 text-center text-sm text-ink/55">
            Không có dữ liệu từ vựng.
          </div>
        )}

      {!loadingDetail && words.length > 0 && viewMode === "tree" && (
        <TreeView
          rootWord={rootWord!}
          words={words}
          expandedWords={expandedWords}
          onToggleExpand={toggleExpand}
        />
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
