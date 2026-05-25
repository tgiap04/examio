import Foundation

enum AppDeepLink: Equatable {
    case examSession(String)
    case flashcard(String)
    case chat(String)
    case profile

    var targetTab: AppTab {
        switch self {
        case .examSession:
            return .exams
        case .flashcard:
            return .study
        case .chat:
            return .ai
        case .profile:
            return .account
        }
    }
}

enum AppTab: Hashable {
    case home
    case study
    case exams
    case ai
    case account
}

func parseAppDeepLink(_ url: URL) -> AppDeepLink? {
    var pathParts = url.pathComponents.dropFirst().filter { !$0.isEmpty }
    if let host = url.host, !host.isEmpty {
        pathParts.insert(host, at: 0)
    }
    guard let route = pathParts.first else { return nil }

    switch route {
    case "exam-session":
        return pathParts.dropFirst().first.map(AppDeepLink.examSession)
    case "flashcard", "study":
        return pathParts.dropFirst().first.map(AppDeepLink.flashcard)
    case "chat":
        return pathParts.dropFirst().first.map(AppDeepLink.chat)
    case "profile":
        return .profile
    default:
        return nil
    }
}
