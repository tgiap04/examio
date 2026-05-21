import { Link } from "react-router-dom";
import { BookOpen, Brain, Trophy } from "lucide-react";

const ways = [
  {
    icon: Brain,
    name: "Tự ôn tập",
    tag: "Học một mình",
    blurb:
      "Tải lên tài liệu, AI tạo flashcard và quiz cá nhân hoá. Lặp lại theo thuật toán giãn cách để ghi nhớ lâu.",
    href: "/k/my-materials",
    cta: "Bắt đầu tự ôn",
  },
  {
    icon: Trophy,
    name: "Phòng luyện thi",
    tag: "Mô phỏng kỳ thi",
    blurb:
      "Tạo đề thi có thời gian, có giám sát. Phù hợp khi bạn đang chuẩn bị cho kỳ thi cuối kỳ hoặc thi tuyển.",
    href: "/k/manage-exam-room",
    cta: "Vào phòng thi",
  },
  {
    icon: BookOpen,
    name: "Hỏi đáp với AI",
    tag: "Học có dẫn dắt",
    blurb:
      "Nói chuyện trực tiếp với AI về nội dung tài liệu. AI trích dẫn nguồn cụ thể, giúp bạn kiểm tra hiểu sâu.",
    href: "/k/ai-tool",
    cta: "Mở AI chat",
  },
];

export default function WaysToStudy() {
  return (
    <section className="bg-canvas landing-dot-paper py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
            Ba cách học
          </p>
          <h2 className="font-display mt-3 text-[36px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[44px]">
            Bạn đang cần ôn theo cách nào?
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-body">
            Examio không ép bạn theo một quy trình duy nhất. Chọn cách phù hợp
            với mục tiêu và lượng thời gian bạn có.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {ways.map(({ icon: Icon, name, tag, blurb, href, cta }) => (
            <article
              key={name}
              className="flex flex-col rounded-[12px] border border-hairline bg-canvas p-8 transition-colors hover:border-coral/40"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-ink" strokeWidth={1.75} />
                <span className="text-[12px] font-medium uppercase tracking-[1.5px] text-muted-foreground">
                  {tag}
                </span>
              </div>
              <h3 className="font-display !mt-3 text-[28px] font-medium leading-[1.2] tracking-[-0.015em] text-ink">
                {name}
              </h3>
              <p className="mt-3 flex-1 text-[15px] leading-[1.6] text-body">
                {blurb}
              </p>
              <Link
                to={href}
                className="mt-6 text-[14px] font-medium text-coral underline-offset-4 hover:underline"
              >
                {cta} →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
