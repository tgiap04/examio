"use client";

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Mail,
  MapPin,
  Phone,
  Send,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ContactSection() {
  const { t } = useTranslation("landing");
  const [isVisible, setIsVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted:", formData);
    setSubmitted(true);
    setFormData({ name: "", email: "", phone: "", message: "" });
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div className="overflow-x-hidden bg-canvas">
      <section className="relative min-h-[55vh] flex flex-col justify-center bg-canvas pt-28 pb-20 md:pt-36 md:pb-24">
        {/* Grid lines */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30 landing-grid-bg" />

        {/* Radial coral glow — right side */}
        <div
          className="absolute right-[-80px] top-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 55% 50%, color-mix(in srgb, var(--coral) 18%, transparent) 0%, transparent 65%)",
          }}
        />

        {/* Trống đồng decoration — left */}
        <div className="absolute left-[-80px] top-1/2 -translate-y-1/2 w-[480px] h-[480px] pointer-events-none">
          <div
            className="w-full h-full"
            style={{
              animation: "spin 55s linear infinite reverse",
              opacity: "var(--trong-dong-opacity)" as unknown as number,
              backgroundColor: "var(--trong-dong-color)",
              filter: "blur(10px)",
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

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div
              className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              <div className="inline-flex items-center gap-2 rounded-[9999px] border border-hairline bg-surface-card px-3 py-1.5">
                <Sparkles className="h-3.5 w-3.5 text-coral" />
                <span className="text-[12px] font-medium uppercase tracking-[1.5px] text-ink">
                  {t("contact.badge")}
                </span>
              </div>
            </div>

            <h1
              className={`font-display !mt-6 text-[44px] font-medium leading-[1.05] tracking-[-0.02em] text-ink sm:text-[56px] lg:text-[64px] transition-all duration-1000 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
              {t("contact.headline")}
            </h1>

            <p
              className={`mt-6 text-[17px] leading-[1.6] text-body transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              {t("contact.description")}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-canvas landing-dot-paper py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <div className="rounded-[16px] border border-hairline bg-surface-card p-8 sm:p-10">
                <h2 className="font-display text-[28px] font-medium leading-[1.15] tracking-[-0.015em] text-ink">
                  {t("contact.form.heading")}
                </h2>
                <p className="mt-2 text-[14px] text-body">
                  {t("contact.form.description")}
                </p>

                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="text-[13px] font-medium text-ink">
                        {t("contact.form.name")}
                      </label>
                      <input
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder={t("contact.form.namePlaceholder")}
                        required
                        className="mt-1.5 h-11 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
                      />
                    </div>
                    <div>
                      <label className="text-[13px] font-medium text-ink">
                        {t("contact.form.email")}
                      </label>
                      <input
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="email@example.com"
                        required
                        className="mt-1.5 h-11 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[13px] font-medium text-ink">
                      {t("contact.form.phone")}
                    </label>
                    <input
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder={t("contact.form.phonePlaceholder")}
                      className="mt-1.5 h-11 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
                    />
                  </div>

                  <div>
                    <label className="text-[13px] font-medium text-ink">
                      {t("contact.form.message")}
                    </label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      placeholder={t("contact.form.messagePlaceholder")}
                      required
                      rows={5}
                      className="mt-1.5 w-full resize-none rounded-[8px] border border-hairline bg-canvas px-3 py-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
                    />
                  </div>

                  <button
                    type="submit"
                    className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-coral px-5 text-[14px] font-medium text-white transition-colors hover:bg-coral-active"
                  >
                    {submitted ? t("contact.form.submitted") : t("contact.form.submit")}
                    {!submitted && <Send className="h-4 w-4" />}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="space-y-5">
                <ContactCard
                  icon={Mail}
                  title={t("contact.card.email")}
                  value="togiap.dev@gmail.com"
                  href="mailto:togiap.dev@gmail.com"
                />
                <ContactCard
                  icon={Phone}
                  title={t("contact.card.phone")}
                  value="(+84) 123 456 789"
                  href="tel:+84123456789"
                />
                <ContactCard
                  icon={MapPin}
                  title={t("contact.card.address")}
                  value={t("contact.card.addressValue")}
                />
              </div>

              <div className="mt-8 rounded-[12px] border border-hairline bg-surface-card p-6">
                <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
                  {t("contact.partnership.badge")}
                </p>
                <h3 className="font-display mt-2 text-[22px] font-medium leading-[1.3] tracking-[-0.01em] text-ink">
                  {t("contact.partnership.headline")}
                </h3>
                <p className="mt-2 text-[14px] leading-[1.6] text-body">
                  {t("contact.partnership.description")}
                </p>
                <Link
                  to="/register"
                  className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-coral hover:text-coral-active"
                >
                  {t("contact.partnership.cta")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContactCard({
  icon: Icon,
  title,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-start gap-4 rounded-[12px] border border-hairline bg-canvas p-5 transition-colors hover:border-coral/40">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-surface-card text-coral">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-muted-foreground">
          {title}
        </p>
        <p className="mt-1 text-[15px] font-medium text-ink">{value}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }
  return content;
}
