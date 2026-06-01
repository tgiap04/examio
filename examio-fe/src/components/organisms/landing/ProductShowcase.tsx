import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "antd";
import { useTranslation } from "react-i18next";

export default function ProductShowcase() {
  const { t } = useTranslation("landing");
  const steps = t("showcase.steps", { returnObjects: true }) as string[];
  return (
    <section id="showcase" className="bg-canvas py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[16px] bg-surface-dark px-6 py-14 sm:px-10 sm:py-16 lg:px-16 lg:py-20">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-accent-amber">
                {t("showcase.badge")}
              </p>
              <h2 className="font-display mt-3 text-[32px] font-medium leading-[1.15] tracking-[-0.02em] text-on-dark sm:text-[40px]">
                {t("showcase.headline")}
              </h2>
              <p className="mt-5 text-[15px] leading-[1.6] text-on-dark-soft">
                {t("showcase.description")}
              </p>

              <ul className="mt-8 space-y-3">
                {steps.map((step, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-[14px] text-on-dark-soft"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent-teal"
                      strokeWidth={2}
                    />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>

              <Button
                href="/k/ai-tool"
                className="mt-10 inline-flex h-11 items-center text-col gap-2 rounded-[8px] bg-on-dark px-5 text-[14px] font-medium text-ink transition-colors hover:bg-on-dark/90"
              >
                {t("showcase.cta")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="lg:col-span-7">
              <ShowcaseTerminal />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ShowcaseTerminal() {
  return (
    <div className="overflow-hidden rounded-[12px] border border-surface-dark-elevated bg-surface-dark-soft">
      <div className="flex items-center justify-between border-b border-surface-dark-elevated px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3d3d3a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3d3d3a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3d3d3a]" />
        </div>
        <span className="font-mono text-[11px] text-on-dark-soft">
          examio · pipeline
        </span>
      </div>

      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-5 py-5 font-mono text-[13px] leading-[1.7]">
        <code>
          <span className="text-on-dark-soft">{"# 1. Upload tài liệu"}</span>
          {"\n"}
          <span className="text-coral">$</span>{" "}
          <span className="text-on-dark">examio upload</span>{" "}
          <span className="text-accent-amber">giai-tich-1.pdf</span>
          {"\n"}
          <span className="text-on-dark-soft">
            ✓ Đã trích xuất 12 chương · 248 khái niệm
          </span>
          {"\n\n"}
          <span className="text-on-dark-soft">{"# 2. Sinh đề trắc nghiệm"}</span>
          {"\n"}
          <span className="text-coral">$</span>{" "}
          <span className="text-on-dark">examio quiz</span>{" "}
          <span className="text-accent-teal">--count=40</span>{" "}
          <span className="text-accent-teal">--difficulty=mixed</span>
          {"\n"}
          <span className="text-on-dark-soft">
            ✓ Sinh 40 câu hỏi (15 dễ · 18 trung bình · 7 khó)
          </span>
          {"\n\n"}
          <span className="text-on-dark-soft">{"# 3. Tạo flashcard"}</span>
          {"\n"}
          <span className="text-coral">$</span>{" "}
          <span className="text-on-dark">examio flashcards</span>{" "}
          <span className="text-accent-teal">--per-chapter=10</span>
          {"\n"}
          <span className="text-on-dark-soft">✓ 120 flashcard sẵn sàng</span>
        </code>
      </pre>
    </div>
  );
}
