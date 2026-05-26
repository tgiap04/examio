import SwiftUI

struct RegisterView: View {
    @ObservedObject var viewModel: AuthViewModel
    let onLogin: () -> Void

    @Environment(\.openURL) private var openURL
    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""

    private var passwordMismatch: Bool { !confirmPassword.isEmpty && password != confirmPassword }
    private var canSubmit: Bool {
        !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        email.contains("@") &&
        password.count >= 6 &&
        password == confirmPassword &&
        !viewModel.isLoading
    }

    var body: some View {
        AuthCardScreen(title: "Đăng Ký", subtitle: "Chào Mừng Đến Với Examio — bắt đầu học, luyện đề và quản lý tài liệu.") {
            VStack(spacing: 14) {
                authIconTextField(title: "Tên Đăng Nhập", systemImage: "person", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                authIconTextField(title: "Email", systemImage: "envelope", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                authIconSecureField(title: "Mật Khẩu", systemImage: "lock", text: $password)

                authIconSecureField(title: "Nhập Lại Mật Khẩu", systemImage: "lock.rotation", text: $confirmPassword)

                if passwordMismatch {
                    Text("Mật khẩu nhập lại không khớp.")
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                AuthMessageView(error: viewModel.errorMessage, success: viewModel.successMessage)

                AuthPrimaryButton(title: "Đăng Ký →", isLoading: viewModel.isLoading) {
                    viewModel.register(username: username.trimmingCharacters(in: .whitespacesAndNewlines),
                                       email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                                       password: password)
                }
                .disabled(!canSubmit)

                authOrDivider

                Button {
                    openGoogleLogin()
                } label: {
                    HStack(spacing: 10) {
                        Text("G")
                            .font(.system(size: 18, weight: .black, design: .rounded))
                            .foregroundStyle(Color(red: 0.26, green: 0.52, blue: 0.96))
                        Text("Google")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.examioInk.opacity(0.82))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.examioBorder, lineWidth: 1))
                }

                HStack(spacing: 4) {
                    Text("Đã có tài khoản?").foregroundStyle(.secondary)
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

    private func openGoogleLogin() {
        if let url = AppConfig.googleOAuthURL() { openURL(url) }
    }
}
