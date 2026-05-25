import SwiftUI

struct ForgotPasswordView: View {
    @ObservedObject var viewModel: AuthViewModel
    let onResetPassword: () -> Void
    let onLogin: () -> Void

    @State private var email = ""

    var body: some View {
        AuthCardScreen(title: "Khôi Phục Mật Khẩu", subtitle: "Nhập email để nhận mã khôi phục mật khẩu.") {
            VStack(spacing: 14) {
                authIconTextField(title: "Email", systemImage: "envelope", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                AuthMessageView(error: viewModel.errorMessage, success: viewModel.successMessage)

                AuthPrimaryButton(title: "Gửi Mã Khôi Phục", isLoading: viewModel.isLoading) {
                    viewModel.sendResetCode(email: email.trimmingCharacters(in: .whitespacesAndNewlines))
                }
                .disabled(viewModel.isLoading || !email.contains("@"))

                Button {
                    viewModel.clearMessages()
                    onResetPassword()
                } label: {
                    Text("Tôi đã có mã →")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.examioPrimary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                        .background(Color.examioPrimary.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.examioPrimary.opacity(0.2), lineWidth: 1))
                }

                HStack(spacing: 4) {
                    Text("Nhớ mật khẩu rồi?").foregroundStyle(.secondary)
                    Button("Đăng Nhập", action: onLogin)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.examioPrimary)
                }
                .font(.footnote)
                .frame(maxWidth: .infinity)
                .padding(.top, 2)
            }
        }
    }
}
