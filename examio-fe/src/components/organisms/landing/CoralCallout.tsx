import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

const stats = [
  { value: "2 phút", label: "để biến PDF thành đề ôn" },
  { value: "120+", label: "flashcard mỗi tài liệu" },
  { value: "Miễn phí", label: "cho người dùng mới" },
];

export default function CoralCallout() {
  return (
    <section className="bg-canvas landing-dot-paper pb-8 dark:bg-canvas pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[16px] bg-coral px-8 py-14 sm:px-12 sm:py-16 lg:px-16 lg:py-20">
          <SpikeMark className="absolute right-10 top-10 h-24 w-24 text-white/10" />
          <SpikeMark className="absolute -left-10 -bottom-10 h-40 w-40 text-white/5" />

          <div className="relative grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-[9999px] bg-white/15 px-3 py-1.5 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-white" />
                <span className="text-[12px] font-medium uppercase tracking-[1.5px] text-white">
                  Sẵn sàng học?
                </span>
              </div>

              <h2 className="font-display !mt-5 text-[40px] font-medium leading-[1.05] tracking-[-0.02em] text-white sm:text-[52px] lg:text-[60px]">
                Bắt đầu học cùng Examio hôm nay.
              </h2>
              <p className="mt-5 max-w-xl text-[16px] leading-[1.6] text-white/85">
                Tải tài liệu đầu tiên và xem AI biến nó thành đề ôn tập trong
                chưa đầy một phút. Không cần thẻ tín dụng, không cần cấu hình.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/register"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-[8px] bg-canvas px-6 text-[14px] font-medium text-ink transition-colors hover:bg-on-dark"
                >
                  Tạo tài khoản miễn phí
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/k"
                  className="inline-flex h-12 items-center justify-center rounded-[8px] border border-white/30 bg-transparent px-6 text-[14px] font-medium text-white transition-colors hover:bg-white/10"
                >
                  Khám phá công cụ
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5">
              <ul className="grid grid-cols-3 gap-3 lg:grid-cols-1 lg:gap-4">
                {stats.map((s) => (
                  <li
                    key={s.label}
                    className="rounded-[12px] border border-white/15 bg-white/10 p-4 backdrop-blur-sm sm:p-5"
                  >
                    <p className="font-display text-[24px] font-medium leading-[1.1] tracking-[-0.01em] text-white sm:text-[28px]">
                      {s.value}
                    </p>
                    <p className="mt-1 text-[12px] leading-[1.4] text-white/80 sm:text-[13px]">
                      {s.label}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SpikeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M50 0 L52 48 L100 50 L52 52 L50 100 L48 52 L0 50 L48 48 Z" />
    </svg>
  );
}
