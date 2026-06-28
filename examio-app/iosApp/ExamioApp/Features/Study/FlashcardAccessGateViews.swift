import SwiftUI

/// "No access" state for denied/private flashcard sets (mirrors FE web).
struct FlashcardDeniedContent: View {
    let onBack: () -> Void
    var body: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "lock.fill").font(.system(size: 44)).foregroundStyle(.secondary)
            Text("Không có quyền truy cập").font(.headline)
            Text("Bộ flashcard này là riêng tư hoặc bạn chưa được thêm vào whitelist.")
                .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button("Quay lại", action: onBack).buttonStyle(.borderedProminent).tint(.examioPrimary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

/// 6-character access code entry sheet for code-protected sets.
struct FlashcardCodeSheet: View {
    let isSubmitting: Bool
    let codeError: String?
    let onSubmit: (String) -> Void
    let onCancel: () -> Void
    @State private var code = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Yêu cầu mã truy cập").font(.headline)
            Text("Bộ flashcard này yêu cầu mã truy cập để xem.")
                .font(.subheadline).foregroundStyle(.secondary)
            TextField("Mã 6 ký tự", text: $code)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .font(.system(.title3, design: .monospaced))
                .padding(12)
                .background(Color.gray.opacity(0.12))
                .cornerRadius(10)
                .onChange(of: code) { new in if new.count > 6 { code = String(new.prefix(6)) } }
            if let err = codeError {
                Text(err).font(.caption).foregroundStyle(.red)
            }
            HStack(spacing: 12) {
                Button("Huỷ", action: onCancel).buttonStyle(.bordered)
                Button(isSubmitting ? "Đang kiểm tra…" : "Xác nhận") { onSubmit(code) }
                    .buttonStyle(.borderedProminent).tint(.examioPrimary)
                    .disabled(code.isEmpty || isSubmitting)
            }
            Spacer()
        }
        .padding(24)
        .presentationDetents([.medium])
    }
}
