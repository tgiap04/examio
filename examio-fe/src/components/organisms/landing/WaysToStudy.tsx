import { Link } from "react-router-dom";
import { BookOpen, Brain, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";

const ways = [
  { icon: Brain, key: "selfStudy", href: "/k/my-materials" },
  { icon: Trophy, key: "examRoom", href: "/k/manage-exam-room" },
  { icon: BookOpen, key: "aiChat", href: "/k/ai-tool" },
];

export default function WaysToStudy() {
  const { t } = useTranslation("landing");
  return (
    <section className="bg-canvas landing-dot-paper py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
            {t("ways.badge")}
          </p>
          <h2 className="font-display mt-3 text-[36px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[44px]">
            {t("ways.headline")}
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-body">
            {t("ways.description")}
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {ways.map(({ icon: Icon, key, href }) => (
            <article
              key={key}
              className="flex flex-col rounded-[12px] border border-hairline bg-canvas p-8 transition-colors hover:border-coral/40"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-ink" strokeWidth={1.75} />
                <span className="text-[12px] font-medium uppercase tracking-[1.5px] text-muted-foreground">
                  {t(`ways.${key}.tag`)}
                </span>
              </div>
              <h3 className="font-display !mt-3 text-[28px] font-medium leading-[1.2] tracking-[-0.015em] text-ink">
                {t(`ways.${key}.name`)}
              </h3>
              <p className="mt-3 flex-1 text-[15px] leading-[1.6] text-body">
                {t(`ways.${key}.blurb`)}
              </p>
              <Link
                to={href}
                className="mt-6 text-[14px] font-medium text-coral underline-offset-4 hover:underline"
              >
                {t(`ways.${key}.cta`)} →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
