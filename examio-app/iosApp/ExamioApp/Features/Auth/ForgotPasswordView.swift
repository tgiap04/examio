import SwiftUI

struct ForgotPasswordView: View {
    @ObservedObject var viewModel: AuthViewModel
    let onResetPassword: () -> Void
    let onLogin: () -> Void

    @State private var email = ""

    var body: some View {
        AuthShell(title: "Khôi phục mật khẩu", subtitle: "Nhập email để nhận mã khôi phục.") {
            TextField("Email", text: $email)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .textFieldStyle(.roundedBorder)
            AuthMessageView(error: viewModel.errorMessage, success: viewModel.successMessage)
            AuthPrimaryButton(title: "Gửi mã", isLoading: viewModel.isLoading) {
                viewModel.sendResetCode(email: email)
            }
            Button("Tôi đã có mã", action: onResetPassword)
            Button("Quay lại đăng nhập", action: onLogin)
                .font(.footnote)
        }
    }
}
