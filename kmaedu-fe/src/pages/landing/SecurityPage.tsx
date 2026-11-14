import { useTranslation } from "react-i18next";
import LegalPageShell from "@/components/organisms/landing/LegalPageShell";

const SECTIONS = ["s1", "s2", "s3", "s4", "s5"] as const;

export default function SecurityPage() {
  const { t } = useTranslation("landing");
  return (
    <LegalPageShell
      eyebrow={t("legal.eyebrow")}
      title={t("security.title")}
      lastUpdated={t("legal.lastUpdated", { date: "18/05/2026" })}
    >
      {SECTIONS.map((key) => (
        <Section key={key} titleKey={`security.${key}.title`} bodyKey={`security.${key}.body`} />
      ))}
    </LegalPageShell>
  );
}

function Section({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  const { t } = useTranslation("landing");
  return (
    <div>
      <h2 className="font-display text-[22px] font-medium leading-[1.3] tracking-[-0.01em] text-ink">
        {t(titleKey)}
      </h2>
      <div className="mt-3">
        <p>{t(bodyKey)}</p>
      </div>
    </div>
  );
}
