import { useEffect, useRef, useState } from "react";
import { Shield, Lock, Eye, FileCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

const icons = [Shield, Lock, Eye, FileCheck];

export default function SecuritySection() {
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

    const securityFeatures = [1, 2, 3, 4].map((i) => ({
        Icon: icons[i - 1],
        title: t(`security.feature${i}.title`),
        description: t(`security.feature${i}.description`),
    }));

    const certifications = [
        t("security.cert1"),
        t("security.cert2"),
        t("security.cert3"),
        t("security.cert4"),
        t("security.cert5"),
    ];

    return (
        <section id="security" ref={sectionRef} className="relative py-24 lg:py-32 bg-foreground/[0.02] overflow-hidden">
            <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
                <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
                    {/* Left: Content */}
                    <div className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
                        <span className="inline-flex items-center gap-3 text-sm font-mono text-coral mb-6">
                            <span className="w-8 h-px bg-coral/30" />
                            {t("security.badge")}
                        </span>
                        <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-8 text-ink">
                            {t("security.headline")}
                            <br />
                            <span className="text-muted-foreground">{t("security.headlineAccent")}</span>
                        </h2>
                        <p className="text-xl text-muted-foreground leading-relaxed mb-12">
                            {t("security.description")}
                        </p>

                        {/* Certifications */}
                        <div className="flex flex-wrap gap-3">
                            {certifications.map((cert, index) => (
                                <span
                                    key={cert}
                                    className={`px-4 py-2 border border-foreground/10 text-sm font-mono transition-all duration-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                                    style={{ transitionDelay: `${index * 50 + 200}ms` }}
                                >
                                    {cert}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Right: Features */}
                    <div className="grid gap-6">
                        {securityFeatures.map((feature, index) => (
                            <div
                                key={feature.title}
                                className={`p-6 border border-foreground/10 hover:border-foreground/20 transition-all duration-500 group ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
                                style={{ transitionDelay: `${index * 100}ms` }}
                            >
                                <div className="flex items-start gap-4">
                                    <div className="shrink-0 w-10 h-10 flex items-center justify-center border border-foreground/10 group-hover:bg-coral group-hover:text-white transition-colors duration-300">
                                        <feature.Icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-medium mb-1 group-hover:translate-x-1 transition-transform duration-300 text-ink">
                                            {feature.title}
                                        </h3>
                                        <p className="text-muted-foreground">{feature.description}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
