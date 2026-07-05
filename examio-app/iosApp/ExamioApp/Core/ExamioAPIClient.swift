import Foundation
import Security

/// Authenticated HTTP client for Examio REST API.
/// Reads access token from Keychain on every request — always up-to-date.
final class ExamioAPIClient {
    static let shared = ExamioAPIClient()

    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let refresher: TokenRefresher

    private init() {
        let url = URL(string: AppConfig.apiBaseURL)!
        baseURL = url
        session = URLSession.shared
        decoder = JSONDecoder()
        refresher = TokenRefresher(baseURL: url)
    }

    func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T {
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        attachToken(&request)
        return try await perform(request)
    }

    func post<T: Decodable>(_ path: String) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        attachToken(&request)
        return try await perform(request)
    }

    func postJSON<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        attachToken(&request)
        return try await perform(request)
    }

    func delete(_ path: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "DELETE"
        attachToken(&request)
        let (_, first) = try await session.data(for: request)
        var response = first
        // Access token expires (~15m); on 401 refresh once and replay with the fresh token.
        if let http = response as? HTTPURLResponse, http.statusCode == 401, await refresher.refresh() {
            attachToken(&request)
            response = try await session.data(for: request).1
        }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.invalidResponse
        }
    }

    func uploadMultipartWithFields<T: Decodable>(
        _ path: String,
        fileData: Data,
        filename: String,
        mimeType: String,
        fieldName: String = "file",
        extraFields: [(String, String)] = []
    ) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var body = Data()
        for (key, value) in extraFields {
            body.append("--\(boundary)\r\n".utf8Bytes)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".utf8Bytes)
            body.append(value.utf8Bytes)
            body.append("\r\n".utf8Bytes)
        }
        body.append("--\(boundary)\r\n".utf8Bytes)
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n".utf8Bytes)
        body.append("Content-Type: \(mimeType)\r\n\r\n".utf8Bytes)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".utf8Bytes)
        request.httpBody = body
        attachToken(&request)
        return try await perform(request)
    }

    func put<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        attachToken(&request)
        return try await perform(request)
    }

    func uploadMultipart<T: Decodable>(_ path: String, fileData: Data, filename: String, mimeType: String, fieldName: String = "file") async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var body = Data()
        body.append("--\(boundary)\r\n".utf8Bytes)
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n".utf8Bytes)
        body.append("Content-Type: \(mimeType)\r\n\r\n".utf8Bytes)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".utf8Bytes)
        request.httpBody = body
        attachToken(&request)
        return try await perform(request)
    }

    private func perform<T: Decodable>(_ request: URLRequest, allowRefresh: Bool = true) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        // Access token expires (~15m). On 401, refresh once (single-flight) and replay the
        // request with the fresh token; allowRefresh=false on the replay bounds it to one retry.
        if http.statusCode == 401, allowRefresh, await refresher.refresh() {
            var retried = request
            attachToken(&retried)
            return try await perform(retried, allowRefresh: false)
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = parseErrorMessage(data) ?? "HTTP \(http.statusCode)"
            throw APIError.server(message: message)
        }
        return try decoder.decode(T.self, from: data)
    }

    private func attachToken(_ request: inout URLRequest) {
        if let token = SessionKeychain.read(account: "accessToken") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let deviceId = SessionKeychain.read(account: "deviceId") {
            request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")
        }
    }

    private func parseErrorMessage(_ data: Data) -> String? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj["message"] as? String ?? obj["error"] as? String
    }
}

/// Keychain read/write for the session tokens (service must match AuthViewModel's store).
private enum SessionKeychain {
    private static let service = "examio.session"

    static func read(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ value: String, account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        guard let data = value.data(using: .utf8) else { return }
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(attributes as CFDictionary, nil)
    }
}

/// Coalesces concurrent 401s into a single POST /auth/refresh round-trip.
private actor TokenRefresher {
    private let baseURL: URL
    private var inFlight: Task<Bool, Never>?

    init(baseURL: URL) { self.baseURL = baseURL }

    /// Returns true when a fresh access token was stored. Concurrent callers share one refresh.
    func refresh() async -> Bool {
        if let task = inFlight { return await task.value }
        let task = Task<Bool, Never> { [baseURL] in
            await TokenRefresher.performRefresh(baseURL: baseURL)
        }
        inFlight = task
        let result = await task.value
        inFlight = nil
        return result
    }

    private static func performRefresh(baseURL: URL) async -> Bool {
        guard let refreshToken = SessionKeychain.read(account: "refreshToken") else { return false }
        var request = URLRequest(url: baseURL.appending(path: "/auth/refresh"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["refreshToken": refreshToken])

        guard
            let (data, response) = try? await URLSession.shared.data(for: request),
            let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let newAccess = (obj["accessToken"] as? String) ?? (obj["token"] as? String)
        else { return false }

        SessionKeychain.save(newAccess, account: "accessToken")
        if let newRefresh = obj["refreshToken"] as? String {
            SessionKeychain.save(newRefresh, account: "refreshToken")
        }
        return true
    }
}

enum APIError: LocalizedError {
    case invalidResponse
    case server(message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Phản hồi không hợp lệ."
        case let .server(message): return message
        }
    }
}

private extension String {
    var utf8Bytes: Data { Data(utf8) }
}
