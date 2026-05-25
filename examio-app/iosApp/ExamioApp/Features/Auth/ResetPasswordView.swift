import SwiftUI

struct ResetPasswordView: View {
    @ObservedObject var viewModel: AuthViewModel
    let onLogin: () -> Void

    @State private var code = ""
    @State private var password = ""
    @State private var confirmPassword = ""

    private var passwordMismatch: Bool { !confirmPassword.isEmpty && password != confirmPassword }
    private var canSubmit: Bool {
        !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        password.count >= 6 &&
        password == confirmPassword &&
        !viewModel.isLoading
    }

    var body: some View {
        AuthCardScreen(title: "Đặt Lại Mật Khẩu", subtitle: "Nhập mã khôi phục và mật khẩu mới của bạn.") {
            VStack(spacing: 14) {
                authIconTextField(title: "Mã Khôi Phục", systemImage: "key", text: $code)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                authIconSecureField(title: "Mật Khẩu Mới", systemImage: "lock", text: $password)

                authIconSecureField(title: "Nhập Lại Mật Khẩu", systemImage: "lock.rotation", text: $confirmPassword)

                if passwordMismatch {
                    Text("Mật khẩu nhập lại không khớp.")
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                AuthMessageView(error: viewModel.errorMessage, success: viewModel.successMessage)

                AuthPrimaryButton(title: "Cập Nhật Mật Khẩu", isLoading: viewModel.isLoading) {
                    viewModel.resetPassword(
                        code: code.trimmingCharacters(in: .whitespacesAndNewlines),
                        password: password
                    )
                }
                .disabled(!canSubmit)

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
