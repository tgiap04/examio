import { Link } from "react-router-dom";
import { ArrowUpRight, FileText, MessageSquareText, Shield } from "lucide-react";

const features = [
  {
    icon: FileText,
    title: "Quiz & Flashcard tự động",
    description:
      "Tải lên PDF, Word hoặc ảnh — AI đọc, phân tích và sinh đề trắc nghiệm cùng flashcard sát với nội dung tài liệu của bạn.",
    href: "/k/ai-tool",
    cta: "Thử tạo quiz",
  },
  {
    icon: Shield,
    title: "Phòng thi có giám sát",
    description:
      "Mở phòng thi trực tuyến với hệ thống chống gian lận, theo dõi camera và hành vi — phù hợp cho lớp học và kỳ kiểm tra nội bộ.",
    href: "/k/manage-exam-room",
    cta: "Tạo phòng thi",
  },
  {
    icon: MessageSquareText,
    title: "AI Tutor hiểu tài liệu",
    description:
      "Đặt câu hỏi trực tiếp về nội dung bạn vừa upload. AI trích dẫn đoạn cụ thể trong tài liệu, không bịa, không lan man.",
    href: "/k/ai-tool",
    cta: "Trò chuyện với AI",
  },
];

export default function FeatureGrid() {
  return (
    <section id="features" className="bg-canvas landing-dot-paper py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
            Tính năng cốt lõi
          </p>
          <h2 className="font-display mt-3 text-[36px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[44px]">
            Mọi thứ bạn cần để học từ tài liệu thật.
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-body">
            Không tổng quát hoá. Không nội dung sao chép. Mỗi tính năng được
            thiết kế cho một thói quen học cụ thể.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {features.map(({ icon: Icon, title, description, href, cta }) => (
            <article
              key={title}
              className="flex flex-col rounded-[12px] bg-surface-card p-8 transition-colors hover:bg-surface-cream-strong"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-canvas text-coral">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="font-display !mt-6 text-[22px] font-medium leading-[1.3] tracking-[-0.01em] text-ink">
                {title}
              </h3>
              <p className="mt-3 flex-1 text-[15px] leading-[1.6] text-body">
                {description}
              </p>
              <Link
                to={href}
                className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-coral hover:text-coral-active"
              >
                {cta}
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
