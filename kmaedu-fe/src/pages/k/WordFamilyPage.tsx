import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useWordFamilyStore } from "@/stores/useWordFamilyStore";
import { Skeleton } from "antd";

export default function WordFamilyPage() {
  const { categories, loadingCategories, error, fetchCategories } =
    useWordFamilyStore();

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  return (
    <div className="relative text-foreground">
      <section className="relative space-y-6">
        <div>
          <h1 className="font-display text-3xl font-normal tracking-tight text-ink">
            Từ vựng tiếng Anh
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Học từ vựng theo phương pháp word family - nhóm từ cùng gốc. Mỗi nhóm sẽ có một từ gốc (root word) và các từ liên quan được sinh ra từ từ gốc đó.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {loadingCategories && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} active paragraph={{ rows: 2 }} />
            ))}
          </div>
        )}

        {!loadingCategories && categories.length === 0 && (
          <p className="text-sm text-ink/50">Chưa có danh mục nào.</p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories
            .filter((c) => c.isActive)
            .map((cat) => (
              <Link
                key={cat.id}
                to={`/k/word-family/${cat.slug}`}
                className="group block overflow-hidden rounded-lg border border-hairline bg-surface-card transition-colors hover:border-coral/30"
              >
                {cat.imageUrl && (
                  <div className="aspect-[16/9] w-full overflow-hidden bg-canvas">
                    <img
                      src={cat.imageUrl}
                      alt={cat.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-display text-lg font-medium text-ink">
                    {cat.name}
                  </h3>
                  {cat.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-ink/60">
                      {cat.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
        </div>
      </section>
    </div>
  );
}
