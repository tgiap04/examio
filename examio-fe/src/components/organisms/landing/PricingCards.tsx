import NumberFlow from "@number-flow/react";
import { Check, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

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
  ctaHref: string;
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
  return (
    <div>
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-[9999px] border border-hairline bg-canvas p-1">
          <ToggleButton active={!isYearly} onClick={() => onToggle(false)}>
            Theo tháng
          </ToggleButton>
          <ToggleButton active={isYearly} onClick={() => onToggle(true)}>
            Theo năm
            <span className={cn("ml-2 rounded-[9999px] bg-coral/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1px]") + (!isYearly ? "bg-coral/25 text-coral" : "border-border border text-black") }>
              
              -20%
            </span>
          </ToggleButton>
        </div>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {tiers.map((tier) => (
          <TierCard key={tier.level} tier={tier} isYearly={isYearly} />
        ))}
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-[9999px] px-4 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-coral text-white"
          : "text-muted-foreground hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function TierCard({ tier, isYearly }: { tier: PricingTier; isYearly: boolean }) {
  const isFeatured = !!tier.popular;
  const price = isYearly ? tier.priceYearly : tier.priceMonthly;

  return (
    <article
      className={cn(
        "relative flex flex-col rounded-[12px] p-8 transition-colors",
        isFeatured
          ? "bg-surface-dark text-on-dark dark:border dark:border-coral dark:bg-surface-dark-elevated dark:shadow-[0_24px_60px_rgba(204,120,92,0.2)]"
          : "border border-hairline bg-canvas text-ink",
      )}
    >
      {isFeatured && (
        <span className="absolute -top-3 left-8 inline-flex items-center gap-1 rounded-[9999px] bg-coral px-3 py-1 text-[11px] font-semibold uppercase tracking-[1.5px] text-white">
          <Sparkles className="h-3 w-3" />
          Phổ biến
        </span>
      )}

      <header>
        <h3
          className={cn(
            "text-[15px] font-medium uppercase tracking-[1.5px]",
            isFeatured ? "text-on-dark-soft" : "text-muted-foreground",
          )}
        >
          {tier.name}
        </h3>
        <p
          className={cn(
            "mt-2 text-[14px] leading-[1.55]",
            isFeatured ? "text-on-dark-soft" : "text-body",
          )}
        >
          {tier.description}
        </p>
      </header>

      <div className="mt-6 flex items-baseline gap-1.5">
        {price === 0 ? (
          <span className="font-display text-[40px] font-medium tracking-[-0.02em]">
            Miễn phí
          </span>
        ) : (
          <>
            <NumberFlow
              format={{
                style: "currency",
                currency: "VND",
                trailingZeroDisplay: "stripIfInteger",
              }}
              value={price}
              className="font-display text-[40px] font-medium tracking-[-0.02em]"
            />
            <span
              className={cn(
                "text-[14px]",
                isFeatured ? "text-on-dark-soft" : "text-muted-foreground",
              )}
            >
              /{isYearly ? "năm" : "tháng"}
            </span>
          </>
        )}
      </div>

      <Link
        to={tier.ctaHref}
        className={cn(
          "mt-6 inline-flex h-11 items-center justify-center rounded-[8px] px-5 text-[14px] font-medium transition-colors",
          isFeatured
            ? "bg-coral text-white hover:bg-coral-active"
            : "bg-foreground text-background hover:opacity-90 dark:bg-coral dark:text-white dark:hover:bg-coral-active",
        )}
      >
        {tier.ctaLabel}
      </Link>

      <ul
        className={cn(
          "mt-8 space-y-3 border-t pt-6",
          isFeatured ? "border-surface-dark-elevated" : "border-hairline",
        )}
      >
        {tier.features.map((f, i) => (
          <li
            key={`${tier.level}-${i}`}
            className={cn(
              "flex items-start gap-2.5 text-[14px] leading-[1.5]",
              !f.included && "opacity-40",
            )}
          >
            <Check
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                isFeatured ? "text-accent-teal" : "text-coral",
              )}
              strokeWidth={2.5}
            />
            <span className={isFeatured ? "text-on-dark" : "text-body-strong"}>
              {f.label}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
