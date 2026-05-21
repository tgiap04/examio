import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Eye,
  FolderCheck,
  Smile,
  Sparkles,
  Target,
} from "lucide-react";

const stats = [
  { icon: Calendar, value: "2+", label: "Năm phát triển" },
  { icon: FolderCheck, value: "10K+", label: "Bài kiểm tra được tạo" },
  { icon: Smile, value: "98%", label: "Người dùng hài lòng" },
];

const values = [
  {
    icon: Target,
    title: "Tập trung vào người học",
    description:
      "Mọi tính năng đều xuất phát từ nhu cầu thực tế của sinh viên và giảng viên, không phải từ xu hướng công nghệ.",
  },
  {
    icon: Eye,
    title: "Minh bạch với AI",
    description:
      "AI trích dẫn nguồn cụ thể từ tài liệu bạn upload. Không bịa, không hallucinate, không nội dung chung chung.",
  },
  {
    icon: BookOpen,
    title: "Học từ tài liệu thật",
    description:
      "Examio không tạo nội dung từ internet. Mọi quiz, flashcard đều sinh từ chính tài liệu bạn cung cấp.",
  },
];

export default function AboutSection() {
  return (
    <div className="overflow-x-hidden bg-canvas">
      <section className="bg-canvas landing-dot-paper pt-28 pb-24 md:pt-32 md:pb-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-[9999px] border border-hairline bg-surface-card px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-coral" />
              <span className="text-[12px] font-medium uppercase tracking-[1.5px] text-ink">
                Về chúng tôi
              </span>
            </div>

            <h1 className="font-display !mt-6 text-[44px] font-medium leading-[1.05] tracking-[-0.02em] text-ink sm:text-[56px] lg:text-[64px]">
              Học tập nên dựa trên tài liệu thật, không phải nội dung bịa.
            </h1>

            <p className="mt-6 text-[17px] leading-[1.6] text-body">
              Examio ra đời từ nhu cầu thực tế: sinh viên cần ôn tập hiệu quả
              từ chính giáo trình của mình, không phải từ nguồn internet chung
              chung. AI của chúng tôi đọc tài liệu bạn upload và biến nó thành
              công cụ học tập cá nhân hoá.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-hairline bg-surface-soft py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            {stats.map(({ icon: Icon, value, label }) => (
              <div key={label} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[12px] bg-canvas text-coral">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <p className="font-display !mt-4 text-[36px] font-medium tracking-[-0.02em] text-ink">
                  {value}
                </p>
                <p className="!-mt-4 text-[14px] text-body">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-canvas landing-dot-paper py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2">
            <article className="rounded-[12px] bg-surface-card p-8 sm:p-10">
              <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
                Sứ mệnh
              </p>
              <h2 className="font-display mt-3 text-[28px] font-medium leading-[1.15] tracking-[-0.015em] text-ink sm:text-[32px]">
                Dân chủ hoá việc ôn tập chất lượng cao.
              </h2>
              <p className="mt-4 text-[15px] leading-[1.6] text-body">
                Không phải ai cũng có gia sư riêng hay nhóm học tập tốt. Examio
                đặt AI vào vai trò đó — phân tích tài liệu, sinh câu hỏi sát
                nội dung, và giúp bạn kiểm tra hiểu biết một cách có hệ thống.
              </p>
            </article>

            <article className="rounded-[12px] bg-surface-card p-8 sm:p-10">
              <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
                Tầm nhìn
              </p>
              <h2 className="font-display mt-3 text-[28px] font-medium leading-[1.15] tracking-[-0.015em] text-ink sm:text-[32px]">
                Mỗi sinh viên đều có trợ lý học tập riêng.
              </h2>
              <p className="mt-4 text-[15px] leading-[1.6] text-body">
                Chúng tôi hướng tới tương lai nơi AI không thay thế giảng viên,
                mà bổ trợ cho quá trình tự học — giúp sinh viên chủ động hơn,
                hiểu sâu hơn, và tự tin hơn khi bước vào phòng thi.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-canvas landing-dot-paper py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
              Giá trị cốt lõi
            </p>
            <h2 className="font-display mt-3 text-[36px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[44px]">
              Những gì chúng tôi tin.
            </h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {values.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="flex flex-col rounded-[12px] border border-hairline bg-canvas p-8 transition-colors hover:border-coral/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-surface-card text-coral">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <h3 className="font-display !mt-6 text-[22px] font-medium leading-[1.3] tracking-[-0.01em] text-ink">
                  {title}
                </h3>
                <p className="flex-1 text-[15px] leading-[1.6] text-body">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-canvas landing-dot-paper py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[16px] bg-coral px-8 py-14 sm:px-12 sm:py-16 lg:px-16 lg:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-[36px] font-medium leading-[1.1] tracking-[-0.02em] text-white sm:text-[44px]">
                Sẵn sàng thử Examio?
              </h2>
              <p className="mt-4 text-[16px] leading-[1.6] text-white/85">
                Tải tài liệu đầu tiên và xem AI biến nó thành đề ôn tập. Miễn
                phí, không cần thẻ tín dụng.
              </p>
              <Link
                to="/register"
                className="mt-8 inline-flex h-12 items-center gap-2 rounded-[8px] bg-canvas px-6 text-[14px] font-medium text-ink transition-colors hover:bg-on-dark"
              >
                Tạo tài khoản miễn phí
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
