import LegalPageShell from "@/components/organisms/landing/LegalPageShell";

export default function SecurityPage() {
  return (
    <LegalPageShell
      eyebrow="Pháp lý"
      title="Chính sách bảo mật"
      lastUpdated="18 tháng 5, 2026"
    >
      <Section title="1. Mã hoá dữ liệu">
        <p>
          Toàn bộ dữ liệu truyền tải giữa trình duyệt và server được mã hoá
          bằng TLS 1.3. Tài liệu lưu trữ trên Cloudflare R2 được mã hoá ở
          trạng thái nghỉ (at-rest encryption).
        </p>
      </Section>

      <Section title="2. Xác thực và phiên">
        <p>
          Examio sử dụng JWT token với thời hạn ngắn, kết hợp quản lý thiết bị
          (device tracking) để phát hiện truy cập bất thường. Phiên đăng nhập có
          thể bị vô hiệu hoá từ xa.
        </p>
      </Section>

      <Section title="3. Bảo vệ tài liệu">
        <p>
          Tài liệu bạn upload chỉ có thể truy cập bởi tài khoản của bạn. Không
          có người dùng khác hoặc nhân viên nào có thể xem nội dung tài liệu mà
          không có sự cho phép rõ ràng.
        </p>
      </Section>

      <Section title="4. AI và dữ liệu">
        <p>
          Nội dung tài liệu được xử lý bởi AI để sinh quiz và flashcard. Dữ
          liệu này không được dùng để huấn luyện mô hình AI và không được chia
          sẻ giữa các người dùng.
        </p>
      </Section>

      <Section title="5. Báo cáo lỗ hổng">
        <p>
          Nếu bạn phát hiện lỗ hổng bảo mật, vui lòng liên hệ ngay qua email:
          togiap.dev@gmail.com. Chúng tôi cam kết phản hồi trong vòng 48 giờ.
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
