import Foundation

enum AppDeepLink: Equatable {
    case examSession(String)
    case flashcard(String)
    case chat(String)
    case profile

    var targetTab: AppTab {
        switch self {
        case .examSession:
            return .baiThi
        case .flashcard:
            return .taiLieu
        case .chat:
            return .aiTool
        case .profile:
            return .lichSu
        }
    }
}

enum AppTab: Hashable {
    case aiTool
    case taiLieu
    case baiThi
    case deThi
    case lichSu
}

func parseAppDeepLink(_ url: URL) -> AppDeepLink? {
    var pathParts = url.pathComponents.dropFirst().filter { !$0.isEmpty }
    if url.scheme != "https", let host = url.host, !host.isEmpty {
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
