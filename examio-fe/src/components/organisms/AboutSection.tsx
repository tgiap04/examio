import { useEffect, useState } from "react";
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
import { useTranslation } from "react-i18next";

export default function AboutSection() {
  const { t } = useTranslation("landing");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const stats = [
    { icon: Calendar, value: t("about.stats.years.value"), label: t("about.stats.years.label") },
    { icon: FolderCheck, value: t("about.stats.exams.value"), label: t("about.stats.exams.label") },
    { icon: Smile, value: t("about.stats.satisfaction.value"), label: t("about.stats.satisfaction.label") },
  ];
  const values = [
    {
      icon: Target,
      key: "learner",
    },
    {
      icon: Eye,
      key: "transparency",
    },
    {
      icon: BookOpen,
      key: "realDocs",
    },
  ];
  return (
    <div className="overflow-x-hidden bg-canvas">
      <section className="relative min-h-[60vh] flex flex-col justify-center bg-canvas pt-28 pb-24 md:pt-36 md:pb-28">
        {/* Grid lines */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30 landing-grid-bg" />

        {/* Radial coral glow — left side */}
        <div
          className="absolute left-[-100px] top-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 45% 50%, color-mix(in srgb, var(--coral) 18%, transparent) 0%, transparent 65%)",
          }}
        />

        {/* Trống đồng decoration — top right */}
        <div className="absolute right-[-60px] top-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none">
          <div
            className="w-full h-full"
            style={{
              animation: "spin 50s linear infinite",
              opacity: "var(--trong-dong-opacity)" as unknown as number,
              backgroundColor: "var(--trong-dong-color)",
              filter: "blur(10px)",
              maskImage: "url(/trong_dong.svg)",
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskImage: "url(/trong_dong.svg)",
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div
              className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              <div className="inline-flex items-center gap-2 rounded-[9999px] border border-hairline bg-surface-card px-3 py-1.5">
                <Sparkles className="h-3.5 w-3.5 text-coral" />
                <span className="text-[12px] font-medium uppercase tracking-[1.5px] text-ink">
                  {t("about.badge")}
                </span>
              </div>
            </div>

            <h1
              className={`font-display !mt-6 text-[44px] font-medium leading-[1.05] tracking-[-0.02em] text-ink sm:text-[56px] lg:text-[64px] transition-all duration-1000 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
              {t("about.headline")}
            </h1>

            <p
              className={`mt-6 text-[17px] leading-[1.6] text-body transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              {t("about.description")}
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
                {t("about.mission.badge")}
              </p>
              <h2 className="font-display mt-3 text-[28px] font-medium leading-[1.15] tracking-[-0.015em] text-ink sm:text-[32px]">
                {t("about.mission.headline")}
              </h2>
              <p className="mt-4 text-[15px] leading-[1.6] text-body">
                {t("about.mission.description")}
              </p>
            </article>

            <article className="rounded-[12px] bg-surface-card p-8 sm:p-10">
              <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
                {t("about.vision.badge")}
              </p>
              <h2 className="font-display mt-3 text-[28px] font-medium leading-[1.15] tracking-[-0.015em] text-ink sm:text-[32px]">
                {t("about.vision.headline")}
              </h2>
              <p className="mt-4 text-[15px] leading-[1.6] text-body">
                {t("about.vision.description")}
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-canvas landing-dot-paper py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
              {t("about.values.badge")}
            </p>
            <h2 className="font-display mt-3 text-[36px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[44px]">
              {t("about.values.headline")}
            </h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {values.map(({ icon: Icon, key }) => (
              <article
                key={key}
                className="flex flex-col rounded-[12px] border border-hairline bg-canvas p-8 transition-colors hover:border-coral/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-surface-card text-coral">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <h3 className="font-display !mt-6 text-[22px] font-medium leading-[1.3] tracking-[-0.01em] text-ink">
                  {t(`about.values.${key}.title`)}
                </h3>
                <p className="flex-1 text-[15px] leading-[1.6] text-body">
                  {t(`about.values.${key}.description`)}
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
                {t("about.cta.headline")}
              </h2>
              <p className="mt-4 text-[16px] leading-[1.6] text-white/85">
                {t("about.cta.description")}
              </p>
              <Link
                to="/register"
                className="mt-8 inline-flex h-12 items-center gap-2 rounded-[8px] bg-canvas px-6 text-[14px] font-medium text-ink transition-colors hover:bg-on-dark"
              >
                {t("about.cta.button")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
