import { Link } from "react-router-dom";
import { ArrowUpRight, FileText, MessageSquareText, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";

const features = [
  {
    icon: FileText,
    key: "quiz",
    href: "/k/ai-tool",
  },
  {
    icon: Shield,
    key: "exam",
    href: "/k/manage-exam-room",
  },
  {
    icon: MessageSquareText,
    key: "tutor",
    href: "/k/ai-tool",
  },
];

export default function FeatureGrid() {
  const { t } = useTranslation("landing");
  return (
    <section id="features" className="bg-canvas landing-dot-paper py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
            {t("features.badge")}
          </p>
          <h2 className="font-display mt-3 text-[36px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[44px]">
            {t("features.headline")}
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-body">
            {t("features.description")}
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {features.map(({ icon: Icon, key, href }) => (
            <article
              key={key}
              className="flex flex-col rounded-[12px] bg-surface-card p-8 transition-colors hover:bg-surface-cream-strong"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-canvas text-coral">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <h3 className="font-display !mt-6 text-[22px] font-medium leading-[1.3] tracking-[-0.01em] text-ink">
                {t(`features.${key}.title`)}
              </h3>
              <p className="mt-3 flex-1 text-[15px] leading-[1.6] text-body">
                {t(`features.${key}.description`)}
              </p>
              <Link
                to={href}
                className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-coral hover:text-coral-active"
              >
                {t(`features.${key}.cta`)}
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
