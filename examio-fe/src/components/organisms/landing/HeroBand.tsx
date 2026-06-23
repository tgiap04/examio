import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const WORDS_INTERVAL = 2500;

export default function HeroBand() {
    const { t } = useTranslation("landing");
    const [isVisible, setIsVisible] = useState(false);
    const [wordIndex, setWordIndex] = useState(0);

    const rotatingWords: string[] = t("hero.rotatingWords", {
        returnObjects: true,
    }) as string[];

    useEffect(() => {
        setIsVisible(true);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setWordIndex((prev) => (prev + 1) % rotatingWords.length);
        }, WORDS_INTERVAL);
        return () => clearInterval(interval);
    }, [rotatingWords.length]);

    const stats = [
        {
            value: t("hero.stat1.value"),
            label: t("hero.stat1.label"),
            company: t("hero.stat1.company"),
        },
        {
            value: t("hero.stat2.value"),
            label: t("hero.stat2.label"),
            company: t("hero.stat2.company"),
        },
        {
            value: t("hero.stat3.value"),
            label: t("hero.stat3.label"),
            company: t("hero.stat3.company"),
        },
        {
            value: t("hero.stat4.value"),
            label: t("hero.stat4.label"),
            company: t("hero.stat4.company"),
        },
    ];

    return (
        <section className="relative min-h-screen flex flex-col justify-center bg-canvas">
            {/* Subtle grid lines background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30 landing-grid-bg" />

            {/* Character sphere glow */}
            <div className="absolute right-[5%] top-1/2 -translate-y-1/2 w-[950px] h-[950px] pointer-events-none z-[3]"
                style={{
                    background: "radial-gradient(ellipse at 50% 50%, color-mix(in srgb, var(--coral) 22%, transparent) 0%, transparent 60%)"
                }}
            />

            {/* Trống đồng — 2D rotation, coral tint via CSS mask */}
            <div className="absolute right-[8%] top-1/2 -translate-y-1/2 w-[900px] h-[900px] pointer-events-none z-20">
                <div
                    className="w-full h-full"
                    style={{
                        animation: "spin 40s linear infinite",
                        opacity: "var(--trong-dong-opacity)" as unknown as number,
                        backgroundColor: "var(--trong-dong-color)",
                        filter: "blur(12px)",
                        maskImage: "url(/trong_dong.svg)",
                        maskSize: "contain",
                        maskRepeat: "no-repeat",
                        maskPosition: "center",
                        WebkitMaskImage: "url(/trong_dong.svg)",
                        WebkitMaskSize: "contain",
                        WebkitMaskRepeat: "no-repeat",
                        WebkitMaskPosition: "center",
                    }}
                />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 pt-32 pb-40">
                {/* Eyebrow */}
                <div
                    className={`mb-8 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                >
                    <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
                        <span className="w-8 h-px bg-foreground/30" />
                        {t("hero.badge")}
                    </span>
                </div>

                {/* Main headline */}
                <div className="mb-12">
                    <h1
                        className={`text-[clamp(3rem,12vw,10rem)] font-display leading-[0.9] tracking-[-0.03em] transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                    >
                        <span className="block text-ink">
                            {t("hero.headline")}
                        </span>
                        <span className="block text-ink">
                            <span className="relative inline-block">
                                <span
                                    key={wordIndex}
                                    className="inline-flex text-coral"
                                >
                                    {rotatingWords[wordIndex]
                                        ?.split("")
                                        .map((char, i) => (
                                            <span
                                                key={`${wordIndex}-${i}`}
                                                className="inline-block animate-char-in"
                                                style={{
                                                    animationDelay: `${i * 50}ms`,
                                                }}
                                            >
                                                {char}
                                            </span>
                                        ))}
                                </span>
                                <span className="absolute -bottom-2 left-0 right-0 h-3 bg-coral/10" />
                            </span>{" "}
                        </span>
                        <span className="block text-ink">
                            {t("hero.headlineSuffix")}
                        </span>
                    </h1>
                </div>

                {/* Description */}
                <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-end">
                    <p
                        className={`text-xl lg:text-2xl text-muted-foreground leading-relaxed max-w-xl transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                    >
                        {t("hero.description")}
                    </p>

                    {/* CTAs */}
                    <div
                        className={`flex flex-col sm:flex-row items-start gap-4 transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                    >
                        <Link
                            to="/register"
                            className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-coral px-8 text-base font-medium text-white transition-colors hover:bg-coral-active group"
                        >
                            {t("hero.cta.primary")}
                            <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                        </Link>
                        <a
                            href="#showcase"
                            className="inline-flex h-14 items-center justify-center rounded-full border border-foreground/20 px-8 text-base font-medium text-ink hover:bg-foreground/5 transition-colors"
                        >
                            {t("hero.cta.secondary")}
                        </a>
                    </div>
                </div>
            </div>

            {/* Stats marquee - full width outside container */}
            <div
                className={`absolute bottom-10 left-0 right-0 transition-all duration-700 delay-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
            >
                <div className="flex gap-16 marquee whitespace-nowrap">
                    {[0, 1].map((setIdx) => (
                        <div key={setIdx} className="flex gap-16">
                            {stats.map((stat) => (
                                <div
                                    key={`${stat.company}-${setIdx}`}
                                    className="flex items-baseline gap-4"
                                >
                                    <span className="text-4xl lg:text-5xl font-display text-ink">
                                        {stat.value}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        {stat.label}
                                        <span className="block font-mono text-xs mt-1 text-muted-soft">
                                            {stat.company}
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
