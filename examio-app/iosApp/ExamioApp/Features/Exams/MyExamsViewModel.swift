import Foundation

struct RecentExamRoomInfo: Decodable {
    let id: String
    let title: String
    let description: String?
}

struct RecentExamSessionInfo: Decodable {
    let id: String
    let startTime: String
    let endTime: String?
    let timeLimitMinutes: Int?
    let showAnswersAfterSubmit: Bool
    let examRoom: RecentExamRoomInfo
}

struct RecentExamAttemptItem: Decodable, Identifiable {
    let id: String
    let examSessionId: String
    let score: Double
    let violationCount: Int
    let startedAt: String
    let finishedAt: String?
    let status: Int
    let totalQuestions: Int
    let correctAnswers: Int
    let timeRemaining: Int?
    let isPinned: Bool
    let examSession: RecentExamSessionInfo
}

struct RecentExamsResponse: Decodable {
    let examAttempts: [RecentExamAttemptItem]
    let total: Int
    let page: Int
    let limit: Int
    let totalPages: Int
}

@MainActor
final class MyExamsViewModel: ObservableObject {
    @Published var attempts: [RecentExamAttemptItem] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let api = ExamioAPIClient.shared

    init() { Task { await load() } }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let response: RecentExamsResponse = try await api.get("/student/recent-exams", query: ["page": "1", "limit": "20"])
            attempts = response.examAttempts
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func togglePin(examRoomId: String) {
        Task {
            _ = try? await api.post("/student/pin-exam-room/\(examRoomId)") as PinResponse
            await load()
        }
    }
}
