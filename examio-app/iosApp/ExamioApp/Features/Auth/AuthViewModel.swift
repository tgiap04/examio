import Foundation
import Security

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    private let api = AuthApiClient()
    private let tokenStore = KeychainTokenStore()

    func login(credential: String, password: String) {
        guard !credential.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Vui lòng nhập email hoặc username."
            return
        }
        guard password.count >= 6 else {
            errorMessage = "Mật khẩu cần ít nhất 6 ký tự."
            return
        }
        runAuthTask {
            let response = try await self.api.login(credential: credential, password: password)
            try self.tokenStore.save(response)
            self.isAuthenticated = true
        }
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
        runAuthTask {
            let response = try await self.api.register(username: username, email: email, password: password)
            try self.tokenStore.save(response)
            self.isAuthenticated = true
        }
    }

    func sendResetCode(email: String) {
        guard email.contains("@") else {
            errorMessage = "Email không hợp lệ."
            return
        }
        runAuthTask {
            self.successMessage = try await self.api.sendResetCode(email: email)
        }
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
        runAuthTask {
            self.successMessage = try await self.api.resetPassword(code: code, password: password)
        }
    }

    func clearMessages() {
        errorMessage = nil
        successMessage = nil
    }

    func completeOAuthCallback(url: URL) {
        guard url.scheme == "examio", url.host == "auth", url.path == "/callback" else { return }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            errorMessage = "Callback đăng nhập Google không hợp lệ."
            return
        }

        let params = Dictionary(uniqueKeysWithValues: components.queryItems?.compactMap { item in
            item.value.map { (item.name, $0) }
        } ?? [])

        guard params["error"] == nil else {
            errorMessage = "Đăng nhập Google thất bại."
            return
        }

        let response = AuthResponse(
            token: params["token"],
            accessToken: params["accessToken"],
            refreshToken: params["refreshToken"],
            sessionId: params["sessionId"],
            deviceId: params["deviceId"]
        )

        do {
            try tokenStore.save(response)
            errorMessage = nil
            successMessage = nil
            isAuthenticated = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func runAuthTask(_ operation: @escaping () async throws -> Void) {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        Task {
            do {
                try await operation()
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

private struct AuthResponse: Codable {
    let token: String?
    let accessToken: String?
    let refreshToken: String?
    let sessionId: String?
    let deviceId: String?

    var resolvedAccessToken: String? { accessToken ?? token }
}

private struct MessageResponse: Codable {
    let message: String?
}

private final class AuthApiClient {
    private let baseURL: URL
    private let decoder = JSONDecoder()

    init() {
        baseURL = URL(string: AppConfig.apiBaseURL)!
    }

    func login(credential: String, password: String) async throws -> AuthResponse {
        try await post(path: "/auth/login", body: ["credential": credential, "password": password])
    }

    func register(username: String, email: String, password: String) async throws -> AuthResponse {
        try await post(path: "/auth/register", body: ["username": username, "email": email, "password": password])
    }

    func sendResetCode(email: String) async throws -> String {
        let response: MessageResponse = try await post(path: "/auth/send-code-reset-password", body: ["email": email])
        return response.message ?? "Mã khôi phục đã được gửi."
    }

    func resetPassword(code: String, password: String) async throws -> String {
        let response: MessageResponse = try await post(path: "/auth/reset-password", body: ["code": code, "newPassword": password])
        return response.message ?? "Mật khẩu đã được cập nhật."
    }

    private func post<T: Decodable>(path: String, body: [String: String]) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw AuthError.server(message: parseErrorMessage(data) ?? "Không thể kết nối Examio.")
        }
        return try decoder.decode(T.self, from: data)
    }

    private func parseErrorMessage(_ data: Data) -> String? {
        guard
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let message = object["message"] as? String ?? object["error"] as? String
        else { return nil }
        return message
    }
}

private final class KeychainTokenStore {
    func save(_ response: AuthResponse) throws {
        guard let accessToken = response.resolvedAccessToken else { throw AuthError.missingToken }
        try save(accessToken, account: "accessToken")
        try save(response.refreshToken, account: "refreshToken")
        try save(response.sessionId, account: "sessionId")
        try save(response.deviceId, account: "deviceId")
    }

    private func save(_ value: String?, account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "examio.session",
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw AuthError.keychain }
    }
}

private enum AuthError: LocalizedError {
    case invalidResponse
    case keychain
    case missingToken
    case server(message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Phản hồi đăng nhập không hợp lệ."
        case .keychain:
            return "Không thể lưu phiên đăng nhập an toàn."
        case .missingToken:
            return "Backend chưa trả về token đăng nhập."
        case let .server(message):
            return message
        }
    }
}
