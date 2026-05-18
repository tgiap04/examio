import LegalPageShell from "@/components/organisms/landing/LegalPageShell";

export default function CookiesPage() {
  return (
    <LegalPageShell
      eyebrow="Pháp lý"
      title="Chính sách Cookie"
      lastUpdated="18 tháng 5, 2026"
    >
      <Section title="1. Cookie là gì?">
        <p>
          Cookie là các tệp nhỏ được lưu trên thiết bị của bạn khi truy cập
          website. Chúng giúp website ghi nhớ thông tin về phiên truy cập của
          bạn.
        </p>
      </Section>

      <Section title="2. Cookie chúng tôi sử dụng">
        <p>
          Examio sử dụng cookie cần thiết cho: duy trì phiên đăng nhập, ghi nhớ
          tuỳ chọn giao diện (dark/light mode, ngôn ngữ), và bảo mật (CSRF
          token). Chúng tôi không sử dụng cookie quảng cáo hoặc tracking bên thứ
          ba.
        </p>
      </Section>

      <Section title="3. Cookie bên thứ ba">
        <p>
          Chúng tôi sử dụng Google reCAPTCHA để bảo vệ form đăng ký/đăng nhập.
          Dịch vụ này có thể đặt cookie riêng theo chính sách của Google.
        </p>
      </Section>

      <Section title="4. Quản lý cookie">
        <p>
          Bạn có thể xoá hoặc chặn cookie thông qua cài đặt trình duyệt. Lưu ý
          rằng việc chặn cookie cần thiết có thể ảnh hưởng đến trải nghiệm sử
          dụng nền tảng.
        </p>
      </Section>
    </LegalPageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-[22px] font-medium leading-[1.3] tracking-[-0.01em] text-ink">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}
