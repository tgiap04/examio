import { useTranslation } from "react-i18next";

export default function TrustStrip() {
  const { t } = useTranslation("landing");
  return (
    <section className="border-y border-hairline bg-surface-soft py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-[12px] font-medium uppercase tracking-[1.5px] text-muted-foreground">
          {t("trust.badge")}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {(t("trust.items", { returnObjects: true }) as string[]).map((item) => (
            <span
              key={item}
              className="font-display text-[18px] font-medium text-ink/80"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
