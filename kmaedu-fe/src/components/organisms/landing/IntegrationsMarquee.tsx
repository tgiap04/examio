import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export default function IntegrationsMarquee() {
    const { t } = useTranslation("landing");
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) setIsVisible(true);
            },
            { threshold: 0.1 },
        );

        if (sectionRef.current) observer.observe(sectionRef.current);
        return () => observer.disconnect();
    }, []);

    const integrations = Array.from({ length: 12 }, (_, i) => ({
        name: t(`integrations.item${i + 1}.name`),
        category: t(`integrations.item${i + 1}.category`),
    }));

    return (
        <section id="integrations" ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden bg-canvas">
            <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
                {/* Header */}
                <div className={`text-center max-w-3xl mx-auto mb-16 lg:mb-24 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
                    <span className="inline-flex items-center gap-3 text-sm font-mono text-coral mb-6">
                        <span className="w-8 h-px bg-coral/30" />
                        {t("integrations.badge")}
                        <span className="w-8 h-px bg-coral/30" />
                    </span>
                    <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-6 text-ink">
                        {t("integrations.headline")}
                    </h2>
                    <p className="text-xl text-muted-foreground">
                        {t("integrations.description")}
                    </p>
                </div>
            </div>

            {/* Full-width marquees outside container */}
            <div className="w-full mb-6">
                <div className="flex gap-6 marquee">
                    {[0, 1].map((setIdx) => (
                        <div key={setIdx} className="flex gap-6 shrink-0">
                            {integrations.map((integration) => (
                                <div
                                    key={`${integration.name}-${setIdx}`}
                                    className="shrink-0 px-8 py-6 border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/[0.02] transition-all duration-300 group"
                                >
                                    <div className="text-lg font-medium group-hover:translate-x-1 transition-transform text-ink">
                                        {integration.name}
                                    </div>
                                    <div className="text-sm text-muted-foreground">{integration.category}</div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Reverse marquee */}
            <div className="w-full">
                <div className="flex gap-6 marquee-reverse">
                    {[0, 1].map((setIdx) => (
                        <div key={setIdx} className="flex gap-6 shrink-0">
                            {[...integrations].reverse().map((integration) => (
                                <div
                                    key={`${integration.name}-reverse-${setIdx}`}
                                    className="shrink-0 px-8 py-6 border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/[0.02] transition-all duration-300 group"
                                >
                                    <div className="text-lg font-medium group-hover:translate-x-1 transition-transform text-ink">
                                        {integration.name}
                                    </div>
                                    <div className="text-sm text-muted-foreground">{integration.category}</div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
