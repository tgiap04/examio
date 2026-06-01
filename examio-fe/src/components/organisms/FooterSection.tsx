"use client";

import * as React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Facebook,
  Instagram,
  Linkedin,
  MapPin,
  Mail,
  Twitter,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../antd/button";
import LanguageSwitcher from "../molecules/language-switcher";

const socials = [
  { icon: Facebook, label: "Facebook", href: "https://www.facebook.com/HocVienKyThuatMatMa" },
  { icon: Twitter, label: "Twitter", href: "#" },
  { icon: Instagram, label: "Instagram", href: "#" },
  { icon: Linkedin, label: "LinkedIn", href: "#" },
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
    <footer className="bg-surface-cream-strong text-body dark:bg-surface-dark-elevated dark:text-on-dark-soft">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid gap-10 border-b border-hairline pb-12 dark:border-white/10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <h3 className="font-display text-[28px] font-medium leading-[1.15] tracking-[-0.015em] text-ink dark:text-on-dark sm:text-[32px]">
              {t("footer.newsletter.heading")}
            </h3>
            <p className="mt-3 text-[14px] leading-[1.6] text-body dark:text-on-dark-soft">
              {t("footer.newsletter.description")}
            </p>
          </div>

          <form
            onSubmit={handleSubscribe}
            className="lg:col-span-7 lg:flex lg:justify-end"
          >
            <div className="flex w-full max-w-md items-center gap-2 rounded-[12px] border border-hairline bg-canvas/60 p-1.5 dark:border-white/10 dark:bg-surface-dark-soft">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("footer.newsletter.placeholder")}
                className="h-10 flex-1 bg-transparent px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:outline-none dark:text-on-dark dark:placeholder:text-on-dark-soft/60"
                required
              />
              <Button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-coral px-4 text-[13px] font-medium text-white transition-colors hover:bg-coral-active"
              >
                {subscribed ? t("footer.newsletter.subscribed") : t("footer.newsletter.subscribe")}
                {!subscribed && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </div>

        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <FooterLogo />
            <p className="!mt-4 max-w-sm text-[14px] leading-[1.6] text-body dark:text-on-dark-soft">
              {t("footer.description")}
            </p>

            <ul className="mt-6 space-y-2.5 text-[13px] text-body dark:text-on-dark-soft">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-coral" strokeWidth={1.75} />
                {t("footer.address")}
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-coral" strokeWidth={1.75} />
                <a
                  href="mailto:contact@examio.vn"
                  className="hover:text-ink dark:hover:text-on-dark"
                >
                  togiap.dev@gmail.com
                </a>
              </li>
            </ul>

            <div className="mt-6 flex items-center gap-2">
              {socials.map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[9999px] border border-hairline text-body transition-colors hover:border-coral hover:bg-canvas/40 hover:text-coral dark:border-white/10 dark:text-on-dark-soft dark:hover:bg-surface-dark-soft"
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </a>
              ))}
            </div>
          </div>

          {linkGroups.map((group) => (
            <nav key={group.title} className="lg:col-span-2">
              <h4 className="text-[12px] font-medium uppercase tracking-[1.5px] text-ink dark:text-on-dark">
                {group.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-[13px] text-body transition-colors hover:text-coral dark:text-on-dark-soft"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col items-start justify-between gap-4 border-t border-hairline pt-8 dark:border-white/10 sm:flex-row sm:items-center">
          <p className="text-[12px] text-muted-foreground dark:text-on-dark-soft">
            © {new Date().getFullYear()} Examio. Made with love by tgiap.dev
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
            <Link to="/terms" className="text-muted-foreground transition-colors hover:text-ink dark:text-on-dark-soft dark:hover:text-on-dark">
              {t("footer.link.terms")}
            </Link>
            <Link to="/privacy" className="text-muted-foreground transition-colors hover:text-ink dark:text-on-dark-soft dark:hover:text-on-dark">
              {t("footer.link.privacy")}
            </Link>
            <Link to="/cookies" className="text-muted-foreground transition-colors hover:text-ink dark:text-on-dark-soft dark:hover:text-on-dark">
              {t("footer.link.cookies")}
            </Link>
            <span className="hidden h-3 w-px bg-hairline dark:bg-white/10 sm:inline-block" />
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLogo() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-coral/15 ring-1 ring-coral/25">
        <img
          src="/examio-lightmode.png"
          alt="Examio"
          className="h-7 w-7 rounded-[6px] object-cover"
        />
      </span>
      <span className="font-display text-[22px] font-semibold leading-none tracking-tight text-ink dark:text-on-dark">
        Examio
      </span>
    </div>
  );
}
