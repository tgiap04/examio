import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function CoralCallout() {
    const { t } = useTranslation("landing");
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef<HTMLDivElement>(null);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) setIsVisible(true);
            },
            { threshold: 0.2 },
        );

        if (sectionRef.current) observer.observe(sectionRef.current);
        return () => observer.disconnect();
    }, []);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePosition({
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100,
        });
    };

    return (
        <section ref={sectionRef} className="relative py-24 lg:py-32 bg-canvas">
            <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
                <div
                    className={`relative border border-foreground transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                    onMouseMove={handleMouseMove}
                >
                    {/* Spotlight effect */}
                    <div
                        className="absolute inset-0 opacity-10 pointer-events-none transition-opacity duration-300"
                        style={{
                            background: `radial-gradient(600px circle at ${mousePosition.x}% ${mousePosition.y}%, rgba(194,82,45,0.15), transparent 40%)`
                        }}
                    />

                    <div className="relative z-10 px-8 lg:px-16 py-16 lg:py-24">
                        <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
                            {/* Left content */}
                            <div className="flex-1">
                                <span className="inline-flex items-center gap-3 text-sm font-mono text-coral mb-6">
                                    <span className="w-8 h-px bg-coral/30" />
                                    {t("startCta.eyebrow")}
                                </span>
                                <h2 className="text-4xl lg:text-7xl font-display tracking-tight mb-8 leading-[0.95] text-ink">
                                    {t("startCta.headline")}
                                    <br />
                                    <span className="text-coral">{t("startCta.headlineAccent")}</span>
                                </h2>

                                <p className="text-xl text-muted-foreground mb-12 leading-relaxed max-w-xl">
                                    {t("startCta.description")}
                                </p>

                                <div className="flex flex-col sm:flex-row items-start gap-4">
                                    <Link
                                        to="/register"
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-coral px-6 text-sm font-medium text-white shadow-[0_6px_16px_rgba(217,45,41,0.25)] transition-colors hover:bg-coral-active group"
                                    >
                                        {t("startCta.primary")}
                                        <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                                    </Link>
                                    <Link
                                        to="/contact"
                                        className="inline-flex h-11 items-center justify-center rounded-full border border-hairline bg-canvas/80 px-6 text-sm font-medium text-ink backdrop-blur hover:bg-surface-soft transition-colors"
                                    >
                                        {t("startCta.secondary")}
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Decorative corners */}
                    <div className="absolute top-0 right-0 w-32 h-32 border-b border-l border-foreground/10" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 border-t border-r border-foreground/10" />
                </div>
            </div>
        </section>
    );
}
