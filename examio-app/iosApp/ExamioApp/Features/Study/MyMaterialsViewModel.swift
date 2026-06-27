import Foundation

struct RecentFlashcardSetItem: Decodable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let thumbnail: String?
    let viewCount: Int
    let flashcardCount: Int
    let lastViewedAt: String?
    let createdAt: String
    let isPublic: Bool
    let isPinned: Bool
    let progress: Double?
}

struct RecentFlashcardsResponse: Decodable {
    let flashcardSets: [RecentFlashcardSetItem]
    let total: Int
    let page: Int
    let limit: Int
    let totalPages: Int
}

struct PinResponse: Decodable {
    let pinned: Bool
}

@MainActor
final class MyMaterialsViewModel: ObservableObject {
    @Published var sets: [RecentFlashcardSetItem] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let api = ExamioAPIClient.shared

    init() { Task { await load() } }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let response: RecentFlashcardsResponse = try await api.get("/student/recent-flashcards", query: ["page": "1", "limit": "20"])
            sets = response.flashcardSets
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func togglePin(id: String) {
        Task {
            _ = try? await api.post("/student/pin-flashcard/\(id)") as PinResponse
            await load()
        }
    }
}
