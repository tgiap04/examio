import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import HeroBand from "@/components/organisms/landing/HeroBand";
import FeatureShowcase from "@/components/organisms/landing/FeatureShowcase";
import ProductShowcase from "@/components/organisms/landing/ProductShowcase";
import StatsSection from "@/components/organisms/landing/StatsSection";
import MetricsSection from "@/components/organisms/landing/MetricsSection";
import IntegrationsMarquee from "@/components/organisms/landing/IntegrationsMarquee";
import SecuritySection from "@/components/organisms/landing/SecuritySection";
import WaysToStudy from "@/components/organisms/landing/WaysToStudy";
import TestimonialsSection from "@/components/organisms/landing/TestimonialsSection";
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
        <div className="overflow-x-hidden bg-canvas noise-overlay">
            <HeroBand />
            <FeatureShowcase />
            <ProductShowcase />
            <StatsSection />
            <MetricsSection />
            <IntegrationsMarquee />
            <SecuritySection />
            <WaysToStudy />
            <TestimonialsSection />
            <CoralCallout />
        </div>
    );
}
