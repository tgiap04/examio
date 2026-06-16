import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/apis/api";
import PricingCards, { type PricingTier } from "@/components/organisms/landing/PricingCards";

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
    1: { ctaHref: "/register" },
    2: { ctaHref: "/k/subscription", popular: true },
    3: { ctaHref: "/contact" },
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
                const res = await api.get<SubscriptionPlanResponse[]>("/payment/subscription/plans");
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
        return () => { cancelled = true; };
    }, [language, t]);

    return (
        <section id="pricing" className="relative py-32 lg:py-40 border-t border-foreground/10 bg-canvas">
            <div className="max-w-7xl mx-auto px-6 lg:px-12">
                {/* Header */}
                <div className="max-w-3xl mb-20">
                    <span className="font-mono text-xs tracking-widest text-coral uppercase block mb-6">
                        {t("pricing.badge")}
                    </span>
                    <h2 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tight text-ink mb-6">
                        {t("pricing.headline")}
                        <br />
                        <span className="text-stroke">{t("pricing.headline").split(" ")[0]}</span>
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-xl">
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
                        <PricingCards tiers={tiers} isYearly={isYearly} onToggle={setIsYearly} />
                    )}
                </div>

                {/* Bottom Note */}
                <p className="!mt-12 text-center text-sm text-muted-foreground">
                    {t("pricing.bottomNote")}{" "}
                    <a href="#" className="underline underline-offset-4 hover:text-ink transition-colors">
                        {t("pricing.compareAll")}
                    </a>
                </p>
            </div>
        </section>
    );
}
