import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    func login(credential: String, password: String) {
        guard !credential.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Vui lòng nhập email hoặc username."
            return
        }
        guard password.count >= 6 else {
            errorMessage = "Mật khẩu cần ít nhất 6 ký tự."
            return
        }
        errorMessage = nil
        isAuthenticated = true
    }

    func register(username: String, email: String, password: String) {
        guard !username.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Vui lòng nhập username."
            return
        }
        guard email.contains("@") else {
            errorMessage = "Email không hợp lệ."
            return
        }
        guard password.count >= 6 else {
            errorMessage = "Mật khẩu cần ít nhất 6 ký tự."
            return
        }
        errorMessage = nil
        isAuthenticated = true
    }

    func sendResetCode(email: String) {
        guard email.contains("@") else {
            errorMessage = "Email không hợp lệ."
            return
        }
        errorMessage = nil
        successMessage = "Mã khôi phục đã được gửi."
    }

    func resetPassword(code: String, password: String) {
        guard !code.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Vui lòng nhập mã khôi phục."
            return
        }
        guard password.count >= 6 else {
            errorMessage = "Mật khẩu cần ít nhất 6 ký tự."
            return
        }
        errorMessage = nil
        successMessage = "Mật khẩu đã được cập nhật."
    }

    func clearMessages() {
        errorMessage = nil
        successMessage = nil
    }
}
