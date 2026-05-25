import SwiftUI

struct LoginView: View {
    @ObservedObject var viewModel: AuthViewModel
    let onRegister: () -> Void
    let onForgotPassword: () -> Void

    @State private var credential = ""
    @State private var password = ""

    var body: some View {
        AuthShell(title: "Chào mừng trở lại", subtitle: "Đăng nhập Examio để tiếp tục học và thi.") {
            TextField("Email hoặc username", text: $credential)
                .textInputAutocapitalization(.never)
                .textFieldStyle(.roundedBorder)
            SecureField("Mật khẩu", text: $password)
                .textFieldStyle(.roundedBorder)
            AuthMessageView(error: viewModel.errorMessage, success: viewModel.successMessage)
            AuthPrimaryButton(title: "Đăng nhập", isLoading: viewModel.isLoading) {
                viewModel.login(credential: credential, password: password)
            }
            HStack {
                Button("Quên mật khẩu", action: onForgotPassword)
                Spacer()
                Button("Tạo tài khoản", action: onRegister)
            }
            .font(.footnote)
        }
    }
}
