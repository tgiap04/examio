import Foundation
import Security

/// Authenticated HTTP client for Examio REST API.
/// Reads access token from Keychain on every request — always up-to-date.
final class ExamioAPIClient {
    static let shared = ExamioAPIClient()

    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder

    private init() {
        baseURL = URL(string: AppConfig.apiBaseURL)!
        session = URLSession.shared
        decoder = JSONDecoder()
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
        let (_, response) = try await session.data(for: request)
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

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = parseErrorMessage(data) ?? "HTTP \(http.statusCode)"
            throw APIError.server(message: message)
        }
        return try decoder.decode(T.self, from: data)
    }

    private func attachToken(_ request: inout URLRequest) {
        if let token = readToken(account: "accessToken") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let deviceId = readToken(account: "deviceId") {
            request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")
        }
    }

    private func readToken(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "examio.session",
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func parseErrorMessage(_ data: Data) -> String? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj["message"] as? String ?? obj["error"] as? String
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
