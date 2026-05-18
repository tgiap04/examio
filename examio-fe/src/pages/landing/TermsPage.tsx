import LegalPageShell from "@/components/organisms/landing/LegalPageShell";

export default function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="Pháp lý"
      title="Điều khoản sử dụng"
      lastUpdated="18 tháng 5, 2026"
    >
      <Section title="1. Giới thiệu">
        <p>
          Chào mừng bạn đến với Examio. Bằng việc truy cập và sử dụng nền tảng
          của chúng tôi, bạn đồng ý tuân thủ các điều khoản và điều kiện được
          nêu trong tài liệu này.
        </p>
      </Section>

      <Section title="2. Tài khoản người dùng">
        <p>
          Bạn chịu trách nhiệm bảo mật thông tin đăng nhập của mình. Examio
          không chịu trách nhiệm cho bất kỳ hoạt động trái phép nào xảy ra
          thông qua tài khoản của bạn.
        </p>
      </Section>

      <Section title="3. Nội dung người dùng">
        <p>
          Tài liệu bạn upload lên Examio vẫn thuộc quyền sở hữu của bạn. Chúng
          tôi chỉ sử dụng nội dung đó để cung cấp dịch vụ (sinh quiz,
          flashcard, AI chat) và không chia sẻ với bên thứ ba.
        </p>
      </Section>

      <Section title="4. Sử dụng hợp lý">
        <p>
          Bạn cam kết không sử dụng nền tảng cho mục đích gian lận thi cử, vi
          phạm bản quyền, hoặc bất kỳ hoạt động bất hợp pháp nào.
        </p>
      </Section>

      <Section title="5. Giới hạn trách nhiệm">
        <p>
          Examio cung cấp dịch vụ "nguyên trạng". Chúng tôi không đảm bảo rằng
          nội dung do AI sinh ra là hoàn toàn chính xác. Người dùng nên kiểm tra
          lại thông tin quan trọng.
        </p>
      </Section>

      <Section title="6. Thay đổi điều khoản">
        <p>
          Chúng tôi có quyền cập nhật điều khoản này. Thay đổi quan trọng sẽ
          được thông báo qua email hoặc thông báo trên nền tảng.
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
