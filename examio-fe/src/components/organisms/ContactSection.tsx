"use client";

import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Mail,
  MapPin,
  Phone,
  Send,
  Sparkles,
} from "lucide-react";

export default function ContactSection() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

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
      <section className="bg-canvas landing-dot-paper pt-28 pb-24 md:pt-32 md:pb-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-[9999px] border border-hairline bg-surface-card px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-coral" />
              <span className="text-[12px] font-medium uppercase tracking-[1.5px] text-ink">
                Liên hệ
              </span>
            </div>

            <h1 className="font-display !mt-6 text-[44px] font-medium leading-[1.05] tracking-[-0.02em] text-ink sm:text-[56px] lg:text-[64px]">
              Chúng tôi luôn sẵn sàng lắng nghe.
            </h1>

            <p className="mt-6 text-[17px] leading-[1.6] text-body">
              Có câu hỏi, góp ý hay muốn hợp tác? Gửi tin nhắn cho chúng tôi
              hoặc liên hệ qua các kênh bên dưới.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-canvas landing-dot-paper py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <div className="rounded-[16px] border border-hairline bg-surface-card p-8 sm:p-10">
                <h2 className="font-display text-[28px] font-medium leading-[1.15] tracking-[-0.015em] text-ink">
                  Gửi tin nhắn
                </h2>
                <p className="mt-2 text-[14px] text-body">
                  Chúng tôi sẽ phản hồi trong vòng 24 giờ.
                </p>

                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="text-[13px] font-medium text-ink">
                        Họ và tên
                      </label>
                      <input
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Nguyễn Văn A"
                        required
                        className="mt-1.5 h-11 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
                      />
                    </div>
                    <div>
                      <label className="text-[13px] font-medium text-ink">
                        Email
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
                      Số điện thoại (tuỳ chọn)
                    </label>
                    <input
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="0912 345 678"
                      className="mt-1.5 h-11 w-full rounded-[8px] border border-hairline bg-canvas px-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
                    />
                  </div>

                  <div>
                    <label className="text-[13px] font-medium text-ink">
                      Nội dung
                    </label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      placeholder="Bạn muốn nói gì với chúng tôi?"
                      required
                      rows={5}
                      className="mt-1.5 w-full resize-none rounded-[8px] border border-hairline bg-canvas px-3 py-3 text-[14px] text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/15"
                    />
                  </div>

                  <button
                    type="submit"
                    className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-coral px-5 text-[14px] font-medium text-white transition-colors hover:bg-coral-active"
                  >
                    {submitted ? "Đã gửi" : "Gửi tin nhắn"}
                    {!submitted && <Send className="h-4 w-4" />}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="space-y-5">
                <ContactCard
                  icon={Mail}
                  title="Email"
                  value="togiap.dev@gmail.com"
                  href="mailto:togiap.dev@gmail.com"
                />
                <ContactCard
                  icon={Phone}
                  title="Điện thoại"
                  value="(+84) 123 456 789"
                  href="tel:+84123456789"
                />
                <ContactCard
                  icon={MapPin}
                  title="Địa chỉ"
                  value="Hà Nội, Việt Nam"
                />
              </div>

              <div className="mt-8 rounded-[12px] border border-hairline bg-surface-card p-6">
                <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-coral">
                  Hợp tác
                </p>
                <h3 className="font-display mt-2 text-[22px] font-medium leading-[1.3] tracking-[-0.01em] text-ink">
                  Bạn là giảng viên hoặc tổ chức giáo dục?
                </h3>
                <p className="mt-2 text-[14px] leading-[1.6] text-body">
                  Chúng tôi có chương trình hợp tác dành riêng cho trường học và
                  tổ chức. Liên hệ để tìm hiểu thêm.
                </p>
                <Link
                  to="/register"
                  className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-coral hover:text-coral-active"
                >
                  Tìm hiểu thêm
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
