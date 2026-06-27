import Foundation

// MARK: - Models

struct HistoryStatsResponse: Decodable {
    let totalPDFs: Int
    let examsCreated: Int
    let flashcardSets: Int
    let totalStudyHours: Int
}

struct PDFHistoryItemResponse: Decodable, Identifiable {
    let id: String
    let filename: String
    let processingStatus: String?
    let createdAt: String?
    let quizHistory: PDFQuizHistoryResponse?
    let flashcardHistory: PDFFlashcardHistoryResponse?
}

struct PDFQuizHistoryResponse: Decodable {
    let quizCount: Int
}

struct PDFFlashcardHistoryResponse: Decodable {
    let flashcardCount: Int
}

struct ExamHistoryItemResponse: Decodable, Identifiable {
    let id: String
    let score: Double?
    let totalQuestions: Int
    let correctAnswers: Int
    let status: Int
    let examSession: ExamSessionHistoryResponse?
}

struct ExamSessionHistoryResponse: Decodable {
    let examRoom: ExamRoomHistoryResponse?
}

struct ExamRoomHistoryResponse: Decodable {
    let id: String
    let title: String
}

struct ExamHistoryListResponse: Decodable {
    let examAttempts: [ExamHistoryItemResponse]
}

// MARK: - ViewModel

@MainActor
final class HistoryViewModel: ObservableObject {
    @Published var isLoading = false
    @Published var stats: HistoryStatsResponse?
    @Published var pdfs: [PDFHistoryItemResponse] = []
    @Published var exams: [ExamHistoryItemResponse] = []
    @Published var error: String?

    private let api = ExamioAPIClient.shared

    init() {
        Task { await load() }
    }

    func load() async {
        isLoading = true
        error = nil
        async let statsResult: HistoryStatsResponse? = try? api.get("/examattempts/history-stats")
        async let pdfsResult: [PDFHistoryItemResponse]? = try? api.get("/ai/recent-uploads", query: ["limit": "20"])
        async let examsResult: ExamHistoryListResponse? = try? api.get("/examattempts/list", query: ["page": "1", "limit": "20"])

        stats = await statsResult
        pdfs = await pdfsResult ?? []
        exams = await examsResult?.examAttempts ?? []
        isLoading = false
    }
}
