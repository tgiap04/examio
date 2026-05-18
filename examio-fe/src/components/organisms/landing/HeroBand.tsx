import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

export default function HeroBand() {
  return (
    <section className="relative bg-canvas landing-dot-paper pt-28 pb-24 md:pt-32 md:pb-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-[9999px] border border-hairline bg-surface-card px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-coral" />
              <span className="text-[12px] font-medium uppercase tracking-[1.5px] text-ink">
                AI cho việc học
              </span>
            </div>

            <h1 className="font-display !mt-6 text-balance text-[44px] font-medium leading-[1.05] tracking-[-0.02em] text-ink sm:text-[56px] lg:text-[64px]">
              Biến mọi tài liệu thành kiến thức bạn nắm chắc.
            </h1>

            <p className="mt-6 max-w-xl text-[17px] leading-[1.6] text-body">
              Examio dùng AI để biến PDF, Word và ảnh chụp giáo trình thành
              quiz, flashcard và phòng luyện thi — tất cả chỉ trong vài giây.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/k"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-coral px-5 text-[14px] font-medium text-white transition-colors hover:bg-coral-active"
              >
                Bắt đầu miễn phí
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#showcase"
                className="inline-flex h-11 items-center justify-center rounded-[8px] border border-hairline bg-canvas px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-card"
              >
                Xem cách hoạt động
              </a>
            </div>
          </div>

          <div className="lg:col-span-6">
            <HeroMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroMockup() {
  return (
    <div className="relative overflow-hidden rounded-[16px] border border-surface-dark-elevated bg-surface-dark p-5 shadow-[0_24px_60px_rgba(20,20,19,0.18)]">
      <div className="flex items-center gap-2 pb-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#3d3d3a]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#3d3d3a]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#3d3d3a]" />
        <span className="ml-3 font-mono text-[12px] text-on-dark-soft">
          examio · giai-tich-1.pdf
        </span>
      </div>

      <div className="rounded-[12px] bg-surface-dark-soft p-5">
        <div className="flex items-center gap-2 pb-3">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-teal" />
          <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-on-dark-soft">
            AI đang phân tích
          </span>
        </div>
        <div className="space-y-2 font-mono text-[13px] leading-[1.6]">
          <p className="text-on-dark-soft">
            <span className="text-coral">→</span> Nhận diện 12 chương · 248 khái niệm
          </p>
          <p className="text-on-dark-soft">
            <span className="text-coral">→</span> Sinh{" "}
            <span className="text-on-dark">40 câu trắc nghiệm</span>
          </p>
          <p className="text-on-dark-soft">
            <span className="text-coral">→</span> Tạo{" "}
            <span className="text-on-dark">120 flashcard</span> theo chủ đề
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-[12px] border border-surface-dark-elevated bg-surface-dark-elevated p-4">
        <p className="text-[12px] uppercase tracking-[1.5px] text-on-dark-soft">
          Câu hỏi mẫu
        </p>
        <p className="mt-2 text-[14px] leading-[1.55] text-on-dark">
          Định lý nào phát biểu rằng một hàm liên tục trên đoạn đóng đạt giá trị
          lớn nhất và nhỏ nhất?
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            { label: "A", text: "Định lý Rolle" },
            { label: "B", text: "Định lý Weierstrass", correct: true },
            { label: "C", text: "Định lý Lagrange" },
            { label: "D", text: "Định lý Bolzano" },
          ].map((opt) => (
            <div
              key={opt.label}
              className={`flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px] ${
                opt.correct
                  ? "border-coral/40 bg-coral/10 text-on-dark"
                  : "border-surface-dark-soft text-on-dark-soft"
              }`}
            >
              <span className="font-mono text-[11px]">{opt.label}.</span>
              <span>{opt.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
