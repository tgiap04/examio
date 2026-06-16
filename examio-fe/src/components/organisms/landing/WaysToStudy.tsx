import { useState, useEffect, useRef } from "react";
import { Copy, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function WaysToStudy() {
    const { t } = useTranslation("landing");
    const [activeTab, setActiveTab] = useState(0);
    const [copied, setCopied] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef<HTMLElement>(null);

    const codeExamples = [
        { label: t("devs.tab1.label"), code: t("devs.tab1.code") },
        { label: t("devs.tab2.label"), code: t("devs.tab2.code") },
        { label: t("devs.tab3.label"), code: t("devs.tab3.code") },
    ];

    const handleCopy = () => {
        navigator.clipboard.writeText(codeExamples[activeTab].code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

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

    const features = [
        { title: t("devs.feature1.title"), description: t("devs.feature1.description") },
        { title: t("devs.feature2.title"), description: t("devs.feature2.description") },
        { title: t("devs.feature3.title"), description: t("devs.feature3.description") },
        { title: t("devs.feature4.title"), description: t("devs.feature4.description") },
    ];

    return (
        <section id="developers" ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden bg-canvas">
            <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
                <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
                    {/* Left: Content */}
                    <div className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
                        <span className="inline-flex items-center gap-3 text-sm font-mono text-coral mb-6">
                            <span className="w-8 h-px bg-coral/30" />
                            {t("devs.badge")}
                        </span>
                        <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-8 text-ink">
                            {t("devs.headline")}
                            <br />
                            <span className="text-muted-foreground">{t("devs.headlineAccent")}</span>
                        </h2>
                        <p className="text-xl text-muted-foreground mb-12 leading-relaxed">
                            {t("devs.description")}
                        </p>

                        {/* Features */}
                        <div className="grid grid-cols-2 gap-6">
                            {features.map((feature, index) => (
                                <div
                                    key={feature.title}
                                    className={`transition-all duration-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                                    style={{ transitionDelay: `${index * 50 + 200}ms` }}
                                >
                                    <h3 className="font-medium mb-1 text-ink">{feature.title}</h3>
                                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Code block */}
                    <div className={`lg:sticky lg:top-32 transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}>
                        <div className="border border-foreground/10">
                            {/* Tabs */}
                            <div className="flex items-center border-b border-foreground/10">
                                {codeExamples.map((example, idx) => (
                                    <button
                                        key={example.label}
                                        type="button"
                                        onClick={() => setActiveTab(idx)}
                                        className={`px-6 py-4 text-sm font-mono transition-colors relative ${activeTab === idx ? "text-ink" : "text-muted-foreground hover:text-ink"}`}
                                    >
                                        {example.label}
                                        {activeTab === idx && (
                                            <span className="absolute bottom-0 left-0 right-0 h-px bg-ink" />
                                        )}
                                    </button>
                                ))}
                                <div className="flex-1" />
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="px-4 py-4 text-muted-foreground hover:text-ink transition-colors"
                                    aria-label={t("devs.copy")}
                                >
                                    {copied ? (
                                        <Check className="w-4 h-4 text-success" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </button>
                            </div>

                            {/* Code content */}
                            <div className="p-8 font-mono text-sm bg-foreground/[0.01] min-h-[220px]">
                                <pre className="text-foreground/80">
                                    {codeExamples[activeTab].code.split("\n").map((line, lineIndex) => (
                                        <div
                                            key={`${activeTab}-${lineIndex}`}
                                            className="leading-loose code-line-reveal"
                                            style={{ animationDelay: `${lineIndex * 80}ms` }}
                                        >
                                            <span className="inline-flex">
                                                {line.split("").map((char, charIndex) => (
                                                    <span
                                                        key={`${activeTab}-${lineIndex}-${charIndex}`}
                                                        className="code-char-reveal"
                                                        style={{
                                                            animationDelay: `${lineIndex * 80 + charIndex * 15}ms`,
                                                        }}
                                                    >
                                                        {char === " " ? " " : char}
                                                    </span>
                                                ))}
                                            </span>
                                        </div>
                                    ))}
                                </pre>
                            </div>
                        </div>

                        {/* Links */}
                        <div className="mt-6 flex items-center gap-6 text-sm">
                            <a href="#" className="text-ink hover:underline underline-offset-4">
                                {t("devs.link1")}
                            </a>
                            <span className="text-foreground/20">|</span>
                            <a href="#" className="text-muted-foreground hover:text-ink">
                                {t("devs.link2")}
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
