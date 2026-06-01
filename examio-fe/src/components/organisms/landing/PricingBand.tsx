import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/apis/api";
import PricingCards, {
  type PricingTier,
} from "@/components/organisms/landing/PricingCards";

interface SubscriptionPlanResponse {
  tier: number;
  name: string;
  nameVi: string;
  creditsPerMonth: number;
  filesPerMonth: number;
  messagesPerMinute: number;
  chatMessagesLimit: number;
  priceMonthly: number;
  priceYearly: number;
}

const tierMeta: Record<number, { ctaHref: string; popular?: boolean }> = {
  1: {
    ctaHref: "/register",
  },
  2: {
    ctaHref: "/k/subscription",
    popular: true,
  },
  3: {
    ctaHref: "/contact",
  },
};

const planNameByLocale: Record<string, Record<number, string>> = {
  en: { 1: "Basic", 2: "Advanced", 3: "VIP" },
  ja: { 1: "ベーシック", 2: "アドバンス", 3: "VIP" },
  vi: { 1: "Cơ bản", 2: "Nâng cao", 3: "VIP" },
};

function formatLimit(value: number, unit: string, unlimitedLabel: string) {
  return value === -1 ? unlimitedLabel : `${value} ${unit}`;
}

function buildTier(
  plan: SubscriptionPlanResponse,
  t: TFunction<"landing">,
  language: string,
): PricingTier | null {
  const meta = tierMeta[plan.tier];
  if (!meta) return null;

  const locale = language.split("-")[0];
  const planName = locale === "vi"
    ? plan.nameVi
    : (planNameByLocale[locale]?.[plan.tier] ?? plan.name);

  const features = [
    { label: `${plan.creditsPerMonth} ${t("pricing.feature.creditsPerMonth")}`, included: true },
    {
      label: formatLimit(plan.filesPerMonth, t("pricing.feature.filesPerMonth"), t("pricing.feature.unlimitedUpload")),
      included: true,
    },
    {
      label: formatLimit(plan.messagesPerMinute, t("pricing.feature.messagesPerMinute"), t("pricing.feature.unlimitedMessages")),
      included: true,
    },
    { label: `${plan.chatMessagesLimit} ${t("pricing.feature.chatMessagesPerDay")}`, included: true },
  ];

  return {
    name: planName,
    level: t(`pricing.tier${plan.tier}.level`),
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    description: t(`pricing.tier${plan.tier}.description`),
    features,
    ctaLabel: t(`pricing.tier${plan.tier}.cta`),
    ctaHref: meta.ctaHref,
    popular: meta.popular,
  };
}

export default function PricingBand() {
  const { t, i18n } = useTranslation("landing");
  const language = i18n.resolvedLanguage ?? i18n.language ?? "vi";
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [isYearly, setIsYearly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get<SubscriptionPlanResponse[]>(
          "/payment/subscription/plans",
        );
        if (cancelled) return;
        const built = res.data
          .sort((a, b) => a.tier - b.tier)
          .map((plan) => buildTier(plan, t, language))
          .filter((t): t is PricingTier => !!t);
        setTiers(built);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch subscription plans:", err);
        setError(t("pricing.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [language, t]);

  return (
    <section id="pricing" className="bg-surface-soft landing-dot-paper py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
            {t("pricing.badge")}
          </p>
          <h2 className="font-display mt-3 text-[36px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[44px]">
            {t("pricing.headline")}
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-body">
            {t("pricing.description")}
          </p>
        </div>

        <div className="mt-12">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-coral" />
            </div>
          ) : error ? (
            <p className="text-center text-[14px] text-error">{error}</p>
          ) : tiers.length === 0 ? null : (
            <PricingCards
              tiers={tiers}
              isYearly={isYearly}
              onToggle={setIsYearly}
            />
          )}
        </div>
      </div>
    </section>
  );
}
