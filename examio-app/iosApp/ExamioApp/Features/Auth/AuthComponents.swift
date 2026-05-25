import SwiftUI

extension Color {
    static let examioCanvas = Color(red: 0.98, green: 0.98, blue: 0.96)
    static let examioInk = Color(red: 0.08, green: 0.08, blue: 0.07)
    static let examioPrimary = Color(red: 0.8, green: 0.47, blue: 0.36)
    static let examioCard = Color(red: 0.94, green: 0.91, blue: 0.87)
}

struct AuthShell<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            Text(title)
                .font(.system(size: 34, weight: .regular, design: .serif))
                .foregroundStyle(Color.examioInk)
            Text(subtitle)
                .font(.body)
                .foregroundStyle(.secondary)
            VStack(spacing: 12) { content }
                .padding(.top, 8)
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
        .background(Color.examioCanvas.ignoresSafeArea())
    }
}

struct AuthPrimaryButton: View {
    let title: String
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(isLoading ? "Đang xử lý..." : title)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        }
        .buttonStyle(.borderedProminent)
        .tint(.examioPrimary)
        .disabled(isLoading)
    }
}

struct AuthMessageView: View {
    let error: String?
    let success: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let error { Text(error).foregroundStyle(.red).font(.footnote) }
            if let success { Text(success).foregroundStyle(Color.examioPrimary).font(.footnote) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
