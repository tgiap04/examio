"use client";

import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../antd/button";
import LanguageSwitcher from "../molecules/language-switcher";
import AnimatedWave from "./landing/AnimatedWave";

const socialLinks = [
  { name: "Facebook", href: "https://www.facebook.com/HocVienKyThuatMatMa" },
  { name: "Twitter", href: "#" },
  { name: "Instagram", href: "#" },
  { name: "LinkedIn", href: "#" },
];

export default function FooterSection() {
  const { t } = useTranslation("common");
  const [email, setEmail] = React.useState("");
  const [subscribed, setSubscribed] = React.useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubscribed(true);
    setEmail("");
    setTimeout(() => setSubscribed(false), 3000);
  };

  const linkGroups = [
    {
      title: t("footer.group.product"),
      links: [
        { label: t("footer.link.features"), to: "/#features" },
        { label: t("footer.link.pricing"), to: "/#pricing" },
        { label: t("footer.link.examRoom"), to: "/k/manage-exam-room" },
        { label: t("footer.link.aiTool"), to: "/k/ai-tool" },
      ],
    },
    {
      title: t("footer.group.resources"),
      links: [
        { label: t("footer.link.about"), to: "/about" },
        { label: t("footer.link.contact"), to: "/contact" },
        { label: t("footer.link.guide"), to: "#" },
        { label: t("footer.link.community"), to: "#" },
      ],
    },
    {
      title: t("footer.group.legal"),
      links: [
        { label: t("footer.link.terms"), to: "/terms" },
        { label: t("footer.link.privacy"), to: "/privacy" },
        { label: t("footer.link.cookies"), to: "/cookies" },
        { label: t("footer.link.security"), to: "/security" },
      ],
    },
  ];

  return (
    <footer className="relative border-t border-foreground/10">
      {/* Animated wave background */}
      <div className="absolute inset-0 h-72 opacity-20 pointer-events-none overflow-hidden">
        <AnimatedWave />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Newsletter Section */}
        <div className="py-16 lg:py-20 border-b border-foreground/10">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-2xl lg:text-3xl font-display tracking-tight">
                {t("footer.newsletter.heading")}
              </h3>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-md">
                {t("footer.newsletter.description")}
              </p>
            </div>

            <form
              onSubmit={handleSubscribe}
              className="lg:justify-self-end w-full lg:w-auto"
            >
              <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-foreground/10 bg-canvas/60 p-1.5">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("footer.newsletter.placeholder")}
                  className="h-10 flex-1 bg-transparent px-3 text-sm text-ink placeholder:text-muted-foreground focus:outline-none"
                  required
                />
                <Button
                  type="submit"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-coral px-4 text-xs font-medium text-white transition-colors hover:bg-coral-active"
                >
                  {subscribed ? t("footer.newsletter.subscribed") : t("footer.newsletter.subscribe")}
                  {!subscribed && <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Main Footer Grid */}
        <div className="py-16 lg:py-24">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-12 lg:gap-8">
            {/* Brand Column */}
            <div className="col-span-2">
              <a href="/" className="inline-flex items-center gap-2 mb-6">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coral/15 ring-1 ring-coral/25">
                  <img
                    src="/examio-lightmode.png"
                    alt="Examio"
                    className="h-6 w-6 rounded-[4px] object-cover"
                  />
                </span>
                <span className="text-xl font-display tracking-tight">Examio</span>
                <span className="text-xs text-muted-foreground font-mono">TM</span>
              </a>

              <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-xs">
                {t("footer.description")}
              </p>

              {/* Social Links — text style with ArrowUpRight */}
              <div className="flex gap-6">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
                  >
                    {link.name}
                    <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </a>
                ))}
              </div>
            </div>

            {/* Link Columns */}
            {linkGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-medium mb-6">{group.title}</h3>
                <ul className="space-y-4">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-8 border-t border-foreground/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Examio. Made with love by tgiap.dev
          </p>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              All systems operational
            </span>
            <span className="hidden h-3 w-px bg-foreground/10 md:inline-block" />
            <div className="flex items-center gap-4">
              <Link to="/terms" className="hover:text-foreground transition-colors">
                {t("footer.link.terms")}
              </Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                {t("footer.link.privacy")}
              </Link>
              <Link to="/cookies" className="hover:text-foreground transition-colors">
                {t("footer.link.cookies")}
              </Link>
            </div>
            <span className="hidden h-3 w-px bg-foreground/10 md:inline-block" />
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
}
