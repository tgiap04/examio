import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import HeroBand from "@/components/organisms/landing/HeroBand";
import TrustStrip from "@/components/organisms/landing/TrustStrip";
import FeatureGrid from "@/components/organisms/landing/FeatureGrid";
import ProductShowcase from "@/components/organisms/landing/ProductShowcase";
import WaysToStudy from "@/components/organisms/landing/WaysToStudy";
import PricingBand from "@/components/organisms/landing/PricingBand";
import CoralCallout from "@/components/organisms/landing/CoralCallout";

export default function HomePage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.replace("#", "");
    const el = document.getElementById(id);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [hash]);

  return (
    <div className="overflow-x-hidden bg-canvas">
      <HeroBand />
      <TrustStrip />
      <FeatureGrid />
      <ProductShowcase />
      <WaysToStudy />
      <PricingBand />
      <CoralCallout />
    </div>
  );
}
