import Foundation

/// Single source of truth for API configuration.
/// Override ExamioAPIBaseURL in Info.plist (or per-scheme xcconfig) to point at a different backend.
enum AppConfig {
    private static let apiPrefix = "/api/v1"
    private static let oauthCallbackScheme = "examio://auth/callback"

    /// Raw backend origin, e.g. "https://api.examio.vn"
    static let baseURL: String = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "ExamioAPIBaseURL") as? String ?? "http://localhost:3000"
        return raw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }()

    /// Base URL including /api/v1 prefix — use for all REST calls
    static let apiBaseURL: String = "\(baseURL)\(apiPrefix)"

    /// Full Google OAuth URL with callback redirect
    static func googleOAuthURL() -> URL? {
        var components = URLComponents(string: "\(apiBaseURL)/auth/google")
        components?.queryItems = [URLQueryItem(name: "redirect", value: oauthCallbackScheme)]
        return components?.url
    }
}
