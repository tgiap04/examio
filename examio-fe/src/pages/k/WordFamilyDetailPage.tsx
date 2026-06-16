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
    <div className="relative min-h-screen bg-background text-foreground">
      <section className="relative mx-auto max-w-7xl space-y-4 px-4 py-6 md:py-8">
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
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-normal tracking-tight text-ink">
            {rootWord}
          </h1>
          <p className="text-sm text-ink/60">
            {words.length} từ vựng &middot; {slug}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-hairline">
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={`rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "tree"
                  ? "bg-coral/10 text-coral"
                  : "text-ink/60 hover:text-ink"
              }`}
            >
              <ApartmentOutlined className="mr-1" />
              Tree
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-r-lg border-l border-hairline px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-coral/10 text-coral"
                  : "text-ink/60 hover:text-ink"
              }`}
            >
              <UnorderedListOutlined className="mr-1" />
              List
            </button>
          </div>

          <Button
            size="small"
            icon={<SaveOutlined />}
            onClick={handleSave}
            disabled={isSaved}
          >
            {isSaved ? "Đã lưu" : "Lưu"}
          </Button>

          {viewMode === "list" && selectedIndices.size > 0 && (
            <Button
              type="primary"
              size="small"
              onClick={() => setShowFlashcardModal(true)}
            >
              Tạo Flashcard ({selectedIndices.size})
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
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
        <p className="text-sm text-ink/50">Không có dữ liệu từ vựng.</p>
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
