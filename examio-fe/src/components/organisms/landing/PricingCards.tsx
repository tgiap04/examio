import NumberFlow from "@number-flow/react";
import { Check, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export interface PricingTierFeature {
    label: string;
    included: boolean;
}

export interface PricingTier {
    name: string;
    level: string;
    priceMonthly: number;
    priceYearly: number;
    description: string;
    features: PricingTierFeature[];
    ctaLabel: string;
    /** null renders the label as plain text (no link). */
    ctaHref: string | null;
    popular?: boolean;
}

interface PricingCardsProps {
    tiers: PricingTier[];
    isYearly: boolean;
    onToggle: (yearly: boolean) => void;
}

export default function PricingCards({
    tiers,
    isYearly,
    onToggle,
}: PricingCardsProps) {
    const { t } = useTranslation("landing");
    return (
        <div>
            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4 mb-16">
                <span className={`text-sm transition-colors ${!isYearly ? "text-ink" : "text-muted-foreground"}`}>
                    {t("pricing.toggle.monthly")}
                </span>
                <button
                    type="button"
                    onClick={() => onToggle(!isYearly)}
                    className="relative w-14 h-7 bg-foreground/10 rounded-full p-1 transition-colors hover:bg-foreground/20"
                >
                    <div className={`w-5 h-5 bg-foreground rounded-full transition-transform duration-300 ${isYearly ? "translate-x-7" : "translate-x-0"}`} />
                </button>
                <span className={`text-sm transition-colors ${isYearly ? "text-ink" : "text-muted-foreground"}`}>
                    {t("pricing.toggle.yearly")}
                </span>
                {isYearly && (
                    <span className="ml-2 px-2 py-1 bg-coral text-white text-xs font-mono">
                        -20%
                    </span>
                )}
            </div>

            {/* Pricing Cards */}
            <div className="grid md:grid-cols-3 gap-px bg-foreground/10">
                {tiers.map((tier, idx) => (
                    <TierCard key={tier.level} tier={tier} isYearly={isYearly} idx={idx} />
                ))}
            </div>
        </div>
    );
}

function TierCard({ tier, isYearly, idx }: { tier: PricingTier; isYearly: boolean; idx: number }) {
    const { t } = useTranslation("landing");
    const isFeatured = !!tier.popular;
    const price = isYearly ? tier.priceYearly : tier.priceMonthly;

    return (
        <article className={`relative p-8 lg:p-12 bg-canvas ${isFeatured ? "md:-my-4 md:py-12 lg:py-16 border-2 border-foreground" : ""}`}>
            {isFeatured && (
                <span className="absolute -top-3 left-8 px-3 py-1 bg-foreground text-canvas text-xs font-mono uppercase tracking-widest">
                    {t("pricing.popular")}
                </span>
            )}

            {/* Plan Header */}
            <div className="mb-8">
                <span className="font-mono text-xs text-muted-foreground">
                    {String(idx + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-3xl text-ink mt-2">{tier.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">{tier.description}</p>
            </div>

            {/* Price */}
            <div className="mb-8 pb-8 border-b border-foreground/10">
                {price === 0 ? (
                    <span className="font-display text-4xl text-ink">{t("pricing.free")}</span>
                ) : (
                    <div className="flex items-baseline gap-2">
                        <NumberFlow
                            format={{
                                style: "currency",
                                currency: "VND",
                                trailingZeroDisplay: "stripIfInteger",
                            }}
                            value={price}
                            className="font-display text-5xl lg:text-6xl text-ink"
                        />
                        <span className="text-muted-foreground">
                            {isYearly ? t("pricing.perYear") : t("pricing.perMonth")}
                        </span>
                    </div>
                )}
            </div>

            {/* Features */}
            <ul className="space-y-4 mb-10">
                {tier.features.map((f, i) => (
                    <li key={`${tier.level}-${i}`} className="flex items-start gap-3">
                        <Check className="w-4 h-4 text-coral mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground">{f.label}</span>
                    </li>
                ))}
            </ul>

            {/* CTA */}
            {tier.ctaHref === null ? (
                <p className="w-full py-4 text-center text-sm font-medium text-muted-foreground border border-foreground/10">
                    {tier.ctaLabel}
                </p>
            ) : (
                <Link
                    to={tier.ctaHref}
                    className={`w-full py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all group ${
                        isFeatured
                            ? "bg-foreground text-canvas hover:bg-foreground/90"
                            : "border border-foreground/20 text-ink hover:border-foreground hover:bg-foreground/5"
                    }`}
                >
                    {tier.ctaLabel}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>
            )}
        </article>
    );
}
