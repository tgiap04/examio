import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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

const tierMeta: Record<
  number,
  { level: string; description: string; ctaLabel: string; ctaHref: string; popular?: boolean }
> = {
  1: {
    level: "starter",
    description: "Đủ để thử và học thường xuyên với tài liệu cá nhân.",
    ctaLabel: "Bắt đầu miễn phí",
    ctaHref: "/register",
  },
  2: {
    level: "pro",
    description: "Dành cho sinh viên ôn thi nghiêm túc, cần thêm credit và dung lượng.",
    ctaLabel: "Nâng cấp Pro",
    ctaHref: "/k/subscription",
    popular: true,
  },
  3: {
    level: "all",
    description: "Cho lớp học, gia sư và nhóm học tập có nhu cầu lớn.",
    ctaLabel: "Liên hệ tư vấn",
    ctaHref: "/contact",
  },
};

function formatLimit(value: number, unit: string, unlimitedLabel: string) {
  return value === -1 ? unlimitedLabel : `${value} ${unit}`;
}

function buildTier(plan: SubscriptionPlanResponse): PricingTier | null {
  const meta = tierMeta[plan.tier];
  if (!meta) return null;

  const features = [
    { label: `${plan.creditsPerMonth} credits / tháng`, included: true },
    {
      label: formatLimit(plan.filesPerMonth, "file / tháng", "Upload không giới hạn"),
      included: true,
    },
    {
      label: formatLimit(plan.messagesPerMinute, "tin nhắn / phút", "Không giới hạn tin nhắn"),
      included: true,
    },
    { label: `${plan.chatMessagesLimit} tin nhắn AI / ngày`, included: true },
  ];

  return {
    name: plan.nameVi,
    level: meta.level,
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    description: meta.description,
    features,
    ctaLabel: meta.ctaLabel,
    ctaHref: meta.ctaHref,
    popular: meta.popular,
  };
}

export default function PricingBand() {
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
          .map(buildTier)
          .filter((t): t is PricingTier => !!t);
        setTiers(built);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch subscription plans:", err);
        setError("Không thể tải bảng giá. Vui lòng thử lại sau.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="pricing" className="bg-surface-soft landing-dot-paper py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
            Bảng giá
          </p>
          <h2 className="font-display mt-3 text-[36px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[44px]">
            Học nhiều hơn, trả ít hơn.
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-body">
            Bắt đầu miễn phí. Nâng cấp khi bạn cần thêm credit, dung lượng tài
            liệu hoặc tính năng phòng thi nâng cao.
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
