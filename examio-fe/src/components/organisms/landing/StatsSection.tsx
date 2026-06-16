import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export default function StatsSection() {
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

    const stats = [
        { value: t("stats.stat1.value"), label: t("stats.stat1.label") },
        { value: t("stats.stat2.value"), label: t("stats.stat2.label") },
        { value: t("stats.stat3.value"), label: t("stats.stat3.label") },
    ];

    const locations = [
        { city: t("stats.location.city1"), region: t("stats.location.region1"), latency: t("stats.location.latency1") },
        { city: t("stats.location.city2"), region: t("stats.location.region2"), latency: t("stats.location.latency2") },
        { city: t("stats.location.city3"), region: t("stats.location.region3"), latency: t("stats.location.latency3") },
        { city: t("stats.location.city4"), region: t("stats.location.region4"), latency: t("stats.location.latency4") },
        { city: t("stats.location.city5"), region: t("stats.location.region5"), latency: t("stats.location.latency5") },
    ];

    const [activeLocation, setActiveLocation] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveLocation((prev) => (prev + 1) % locations.length);
        }, 2000);
        return () => clearInterval(interval);
    }, [locations.length]);

    return (
        <section ref={sectionRef} className="relative py-24 lg:py-32 bg-canvas overflow-hidden">
            <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
                <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
                    {/* Left: Content */}
                    <div className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}>
                        <span className="inline-flex items-center gap-3 text-sm font-mono text-coral mb-6">
                            <span className="w-8 h-px bg-coral/30" />
                            {t("stats.badge")}
                        </span>
                        <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-8 text-ink">
                            {t("stats.headline")}
                            <br />
                            <span className="text-muted-foreground">{t("stats.headlineAccent")}</span>
                        </h2>
                        <p className="text-xl text-muted-foreground leading-relaxed mb-12">
                            {t("stats.description")}
                        </p>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-8">
                            {stats.map((stat) => (
                                <div key={stat.label}>
                                    <div className="text-4xl lg:text-5xl font-display mb-2 text-ink">{stat.value}</div>
                                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Location list */}
                    <div className={`transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}>
                        <div className="border border-foreground/10">
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between">
                                <span className="text-sm font-mono text-muted-foreground">{t("stats.location.network")}</span>
                                <span className="flex items-center gap-2 text-xs font-mono text-success">
                                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                                    {t("stats.location.status")}
                                </span>
                            </div>

                            {/* Locations */}
                            <div>
                                {locations.map((location, index) => (
                                    <div
                                        key={location.city}
                                        className={`px-6 py-5 border-b border-foreground/5 last:border-b-0 flex items-center justify-between transition-all duration-300 ${activeLocation === index ? "bg-foreground/[0.02]" : ""}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <span className={`w-2 h-2 rounded-full transition-colors duration-300 ${activeLocation === index ? "bg-coral" : "bg-foreground/20"}`} />
                                            <div>
                                                <div className="font-medium text-ink">{location.city}</div>
                                                <div className="text-sm text-muted-foreground">{location.region}</div>
                                            </div>
                                        </div>
                                        <span className="font-mono text-sm text-muted-foreground">{location.latency}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
