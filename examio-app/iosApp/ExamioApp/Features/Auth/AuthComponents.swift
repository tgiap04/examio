import SwiftUI

extension Color {
    static let examioCanvas = Color(red: 0.98, green: 0.98, blue: 0.96)
    static let examioInk = Color(red: 0.08, green: 0.08, blue: 0.07)
    static let examioPrimary = Color(red: 0.8, green: 0.47, blue: 0.36)
    static let examioCard = Color(red: 0.94, green: 0.91, blue: 0.87)
    static let examioSurface = Color(red: 0.99, green: 0.97, blue: 0.94)
    static let examioBorder = Color(red: 0.89, green: 0.84, blue: 0.79)
}

// MARK: - Shared card-based auth layout (matches examio-fe responsive style)

struct AuthCardScreen<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 1.0, green: 0.97, blue: 0.93), Color.examioCanvas, Color.examioCard],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(Color.examioPrimary.opacity(0.14))
                .frame(width: 180, height: 180)
                .blur(radius: 2)
                .offset(x: -120, y: -280)

            Circle()
                .fill(Color(red: 0.95, green: 0.71, blue: 0.43).opacity(0.16))
                .frame(width: 220, height: 220)
                .blur(radius: 4)
                .offset(x: 140, y: 290)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 22) {
                    authBrandHeader
                    AuthCardView(title: title, subtitle: subtitle) { content }
                }
                .frame(maxWidth: 430)
                .padding(.horizontal, 20)
                .padding(.vertical, 36)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var authBrandHeader: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color.examioPrimary.opacity(0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color.examioPrimary.opacity(0.25), lineWidth: 1)
                    )
                Image("ExamioLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 52, height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .frame(width: 78, height: 78)
            .shadow(color: Color.examioPrimary.opacity(0.12), radius: 18, x: 0, y: 10)

            Label("Nền tảng học tập cùng AI", systemImage: "sparkles")
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
        }
    }

}

private struct AuthCardView<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.examioInk)
                Text(subtitle)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.bottom, 4)

            content
        }
        .padding(22)
        .background(Color.white.opacity(0.82), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color(red: 0.91, green: 0.84, blue: 0.78), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 24, x: 0, y: 14)
    }
}

// MARK: - Reusable form fields

func authIconTextField(title: String, systemImage: String, text: Binding<String>) -> some View {
    HStack(spacing: 10) {
        Image(systemName: systemImage)
            .foregroundStyle(Color.examioPrimary)
            .frame(width: 20)
        TextField(title, text: text)
    }
    .padding(.horizontal, 14)
    .frame(height: 52)
    .background(Color.examioSurface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.examioBorder, lineWidth: 1))
}

func authIconSecureField(title: String, systemImage: String, text: Binding<String>) -> some View {
    HStack(spacing: 10) {
        Image(systemName: systemImage)
            .foregroundStyle(Color.examioPrimary)
            .frame(width: 20)
        SecureField(title, text: text)
    }
    .padding(.horizontal, 14)
    .frame(height: 52)
    .background(Color.examioSurface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.examioBorder, lineWidth: 1))
}

var authOrDivider: some View {
    HStack(spacing: 12) {
        Rectangle().fill(Color.examioBorder).frame(height: 1)
        Text("Hoặc tiếp tục với")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .fixedSize()
        Rectangle().fill(Color.examioBorder).frame(height: 1)
    }
    .padding(.vertical, 2)
}

// MARK: - Legacy AuthShell (kept for backward compat, unused after redesign)

struct AuthShell<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        AuthCardScreen(title: title, subtitle: subtitle) { content }
    }
}

// MARK: - Buttons & messages

struct AuthPrimaryButton: View {
    let title: String
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(isLoading ? "Đang xử lý..." : title)
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(Color.examioPrimary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: Color.examioPrimary.opacity(0.28), radius: 16, x: 0, y: 8)
        }
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
