import LegalPageShell from "@/components/organisms/landing/LegalPageShell";

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Pháp lý"
      title="Chính sách quyền riêng tư"
      lastUpdated="18 tháng 5, 2026"
    >
      <Section title="1. Thông tin chúng tôi thu thập">
        <p>
          Khi bạn đăng ký tài khoản, chúng tôi thu thập: tên đăng nhập, email,
          và thông tin thiết bị (để quản lý phiên đăng nhập). Tài liệu bạn
          upload được lưu trữ an toàn và chỉ dùng để cung cấp dịch vụ.
        </p>
      </Section>

      <Section title="2. Cách chúng tôi sử dụng thông tin">
        <p>
          Thông tin của bạn được sử dụng để: cung cấp và cải thiện dịch vụ, gửi
          thông báo quan trọng, và hỗ trợ kỹ thuật. Chúng tôi không bán thông
          tin cá nhân cho bên thứ ba.
        </p>
      </Section>

      <Section title="3. Lưu trữ và bảo mật">
        <p>
          Dữ liệu được lưu trữ trên hạ tầng đám mây với mã hoá trong quá trình
          truyền tải (TLS) và lưu trữ. Tài liệu người dùng được lưu trên
          Cloudflare R2 với access control nghiêm ngặt.
        </p>
      </Section>

      <Section title="4. Quyền của bạn">
        <p>
          Bạn có quyền: truy cập dữ liệu cá nhân, yêu cầu xoá tài khoản và
          toàn bộ dữ liệu liên quan, và rút lại sự đồng ý bất kỳ lúc nào bằng
          cách liên hệ với chúng tôi.
        </p>
      </Section>

      <Section title="5. Chia sẻ với bên thứ ba">
        <p>
          Chúng tôi chỉ chia sẻ dữ liệu với các nhà cung cấp dịch vụ cần thiết
          (hosting, AI model providers) theo hợp đồng bảo mật. Không có dữ liệu
          nào được bán hoặc dùng cho quảng cáo.
        </p>
      </Section>

      <Section title="6. Liên hệ">
        <p>
          Nếu có câu hỏi về quyền riêng tư, vui lòng liên hệ qua email:
          togiap.dev@gmail.com
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
