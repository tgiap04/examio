import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, User } from "lucide-react";
import { Button } from "@/components/antd/button";
import { Skeleton } from "@/components/antd/skeleton";
import type { SharedQuizSet, SharedQuizSetsResponse } from "@/apis/quizPracticeApi";
import { useQuizPracticeStore } from "@/stores/useQuizPracticeStore";

const PAGE_SIZE = 6;

function lastAttemptLabel(set: SharedQuizSet): string | null {
  const last = set.lastAttempt;
  if (!last) return null;
  return last.isSubmitted ? `Lần gần nhất: ${last.score ?? 0}/10` : "Đang làm dở";
}

/** "Bộ câu hỏi được chia sẻ": the sets granted to me (whitelist or code), with a practice button. */
export function SharedQuizSection() {
  const navigate = useNavigate();
  const fetchSets = useQuizPracticeStore((s) => s.fetchSets);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SharedQuizSetsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (target: number) => {
      setFailed(false);
      try {
        setData(await fetchSets(target, PAGE_SIZE));
      } catch {
        setFailed(true);
      }
    },
    [fetchSets],
  );

  useEffect(() => {
    void load(page);
  }, [page, load]);

  return (
    <section className="mt-12" aria-labelledby="shared-quiz-heading">
      <h2 id="shared-quiz-heading" className="text-2xl tracking-tight text-ink">
        Bộ câu hỏi được chia sẻ
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Các bộ câu hỏi giáo viên đã chia sẻ cho bạn luyện tập</p>

      {failed ? (
        <div className="mt-6 space-y-3 rounded-lg border border-hairline-soft bg-surface-soft py-10 text-center">
          <p className="text-sm text-destructive">Không thể tải bộ câu hỏi được chia sẻ</p>
          <Button variant="outline" size="sm" onClick={() => load(page)}>
            Thử lại
          </Button>
        </div>
      ) : data === null ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-lg" />
          ))}
        </div>
      ) : data.sets.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-lg border border-hairline-soft bg-surface-soft py-12">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-ink">Chưa có bộ câu hỏi nào được chia sẻ</p>
          <p className="mt-1 text-sm text-muted-foreground">Mở liên kết và nhập mã giáo viên gửi để thêm vào đây</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.sets.map((set) => (
              <article key={set.id} className="flex flex-col justify-between rounded-lg border border-hairline bg-canvas p-5">
                <div>
                  <h3 className="line-clamp-2 text-[15px] font-medium text-ink">{set.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{set.questionCount} câu hỏi</p>
                  {set.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{set.description}</p>}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-hairline-soft pt-3">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    {set.owner.name || "Ẩn danh"}
                    {lastAttemptLabel(set) && <span className="ml-2">· {lastAttemptLabel(set)}</span>}
                  </span>
                  <Button size="sm" className="h-8 px-3 text-xs" onClick={() => navigate(`/k/practice-quiz/${set.id}`)}>
                    Luyện tập
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Trước
              </Button>
              <span className="text-muted-foreground">
                {page}/{data.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
                Sau
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
