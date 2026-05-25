import SwiftUI

struct RegisterView: View {
    @ObservedObject var viewModel: AuthViewModel
    let onLogin: () -> Void

    @State private var username = ""
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        AuthShell(title: "Tạo tài khoản", subtitle: "Bắt đầu quản lý tài liệu, flashcard và kỳ thi.") {
            TextField("Username", text: $username)
                .textInputAutocapitalization(.never)
                .textFieldStyle(.roundedBorder)
            TextField("Email", text: $email)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .textFieldStyle(.roundedBorder)
            SecureField("Mật khẩu", text: $password)
                .textFieldStyle(.roundedBorder)
            AuthMessageView(error: viewModel.errorMessage, success: viewModel.successMessage)
            AuthPrimaryButton(title: "Đăng ký", isLoading: viewModel.isLoading) {
                viewModel.register(username: username, email: email, password: password)
            }
            Button("Đã có tài khoản? Đăng nhập", action: onLogin)
                .font(.footnote)
        }
    }
}
