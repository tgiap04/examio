import SwiftUI

struct ResetPasswordView: View {
    @ObservedObject var viewModel: AuthViewModel
    let onLogin: () -> Void

    @State private var code = ""
    @State private var password = ""

    var body: some View {
        AuthShell(title: "Đặt lại mật khẩu", subtitle: "Nhập mã khôi phục và mật khẩu mới.") {
            TextField("Mã khôi phục", text: $code)
                .textInputAutocapitalization(.never)
                .textFieldStyle(.roundedBorder)
            SecureField("Mật khẩu mới", text: $password)
                .textFieldStyle(.roundedBorder)
            AuthMessageView(error: viewModel.errorMessage, success: viewModel.successMessage)
            AuthPrimaryButton(title: "Cập nhật mật khẩu", isLoading: viewModel.isLoading) {
                viewModel.resetPassword(code: code, password: password)
            }
            Button("Quay lại đăng nhập", action: onLogin)
                .font(.footnote)
        }
    }
}
