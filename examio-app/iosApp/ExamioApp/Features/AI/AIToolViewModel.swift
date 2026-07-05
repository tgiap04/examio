import Foundation

// MARK: - Models

struct GenerateJobResponse: Decodable {
    let jobId: String
}

struct JobStatusResponse: Decodable {
    let jobId: String
    let status: String      // backend: pending | processing | completed | failed (matched case-insensitively)
    let progress: Int?
    let message: String?
    let error: String?
    let result: JobResult?
}

struct JobResult: Decodable {
    let type: String            // "quiz" | "flashcard"
    let historyId: String?
    // Generated content returned inline by the backend on a completed job.
    let quizzes: [GeneratedQuizItem]?
    let flashcards: [GeneratedFlashcardItem]?
}

struct GeneratedQuizItem: Decodable, Identifiable {
    let id = UUID()
    let question: String
    let options: [String]
    let answer: String

    private enum CodingKeys: String, CodingKey { case question, options, answer }
}

struct GeneratedFlashcardItem: Decodable, Identifiable {
    let id = UUID()
    let question: String
    let answer: String

    private enum CodingKeys: String, CodingKey { case question, answer }
}

// Set list / create + save-history payloads (mirror the backend contract the FE uses).
struct QuizSetItem: Decodable, Identifiable { let id: String; let title: String }
struct FlashcardSetItem: Decodable, Identifiable { let id: String; let title: String }
struct QuizSetListResponse: Decodable { let quizSets: [QuizSetItem] }
struct FlashcardSetListResponse: Decodable { let flashcardSets: [FlashcardSetItem] }
struct CreateSetBody: Encodable { let title: String }
struct QuizSetCreateResponse: Decodable { let quizSet: QuizSetItem }
struct SaveHistoryToQuizsetBody: Encodable { let quizsetIds: [String]; let historyId: String }
struct SaveHistoryToFlashcardSetBody: Encodable { let flashcardsetIds: [String]; let historyId: String }
struct SaveHistoryResult: Decodable { let createdCount: Int }

// MARK: - ViewModel

@MainActor
final class AIToolViewModel: ObservableObject {
    // generator inputs
    @Published var typeResult: Int = 1        // 1 = quiz, 2 = flashcard
    @Published var quantity: Int = 5
    @Published var selectedFileName: String?
    @Published var isGenerating = false
    @Published var jobStatus: JobStatusResponse?
    @Published var generateError: String?
    private var pendingFileData: Data?
    private var pendingFileName: String?
    // completed generation + save-to-set
    @Published var generatedResult: JobResult?
    @Published var quizSets: [QuizSetItem] = []
    @Published var flashcardSets: [FlashcardSetItem] = []
    @Published var isSaving = false
    @Published var saveError: String?
    @Published var savedCount: Int?

    private let api = ExamioAPIClient.shared
    private var pollTask: Task<Void, Never>?

    // ── Generator ─────────────────────────────────────────────────────────

    func onFileSelected(data: Data, filename: String) {
        pendingFileData = data
        pendingFileName = filename
        selectedFileName = filename
    }

    func generate() {
        guard let data = pendingFileData, let filename = pendingFileName else { return }
        isGenerating = true
        generateError = nil
        jobStatus = nil
        generatedResult = nil
        savedCount = nil
        saveError = nil

        Task {
            do {
                let fields: [(String, String)] = [
                    ("typeResult", "\(typeResult)"),
                    (typeResult == 1 ? "quantityQuizz" : "quantityFlashcard", "\(quantity)"),
                    ("isNarrowSearch", "false"),
                ]

                let response: GenerateJobResponse = try await api.uploadMultipartWithFields(
                    "/ai/generate-from-file",
                    fileData: data,
                    filename: filename,
                    mimeType: "application/pdf",
                    extraFields: fields,
                )
                startPolling(jobId: response.jobId)
            } catch {
                generateError = error.localizedDescription
                isGenerating = false
            }
        }
    }

    private func startPolling(jobId: String) {
        pollTask?.cancel()
        pollTask = Task {
            var delayMs: UInt64 = 2_000
            var elapsed: UInt64 = 0
            let timeout: UInt64 = 600_000  // 10 min — matches backend regenerate gateway timeout

            while elapsed < timeout {
                guard !Task.isCancelled else { return }
                try? await Task.sleep(nanoseconds: delayMs * 1_000_000)
                elapsed += delayMs
                delayMs = min(UInt64(Double(delayMs) * 1.5), 10_000)

                guard let status: JobStatusResponse = try? await api.get("/ai/job/\(jobId)") else { continue }
                jobStatus = status
                // Backend emits lowercase pending|processing|completed|failed.
                let terminal = ["completed", "failed", "cancelled"]
                if terminal.contains(status.status.lowercased()) {
                    isGenerating = false
                    if status.status.lowercased() == "completed" {
                        generatedResult = status.result
                        await loadTargetSets()
                    }
                    return
                }
            }
            jobStatus = JobStatusResponse(jobId: jobId, status: "failed", progress: nil, message: nil, error: "Hết thời gian chờ", result: nil)
            isGenerating = false
        }
    }

    // ── Save generated result into a set ────────────────────────────────────

    // The generated content's true domain is the job result's own type, NOT the
    // mutable UI toggle — result.type/historyId is the only trustworthy pairing.
    private var resultIsQuiz: Bool { generatedResult?.type == "quiz" }

    private func loadTargetSets() async {
        do {
            if resultIsQuiz {
                let r: QuizSetListResponse = try await api.get("/quizsets", query: ["page": "1", "limit": "100"])
                quizSets = r.quizSets
            } else {
                let r: FlashcardSetListResponse = try await api.get("/flashcardsets", query: ["page": "1", "limit": "100"])
                flashcardSets = r.flashcardSets
            }
        } catch { /* non-fatal: user can still create a new set */ }
    }

    func saveToNewSet(title: String) {
        let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { saveError = "Nhập tên bộ"; return }
        guard let historyId = generatedResult?.historyId else { saveError = "Chưa có kết quả để lưu"; return }
        Task {
            isSaving = true
            saveError = nil
            do {
                if resultIsQuiz {
                    let created: QuizSetCreateResponse = try await api.postJSON("/quizsets", body: CreateSetBody(title: name))
                    try await saveQuizHistory(setId: created.quizSet.id, historyId: historyId)
                } else {
                    let created: FlashcardSetItem = try await api.postJSON("/flashcardsets", body: CreateSetBody(title: name))
                    try await saveFlashcardHistory(setId: created.id, historyId: historyId)
                }
            } catch {
                saveError = error.localizedDescription
                isSaving = false
            }
        }
    }

    func saveToExistingSet(id setId: String) {
        guard let historyId = generatedResult?.historyId else { saveError = "Chưa có kết quả để lưu"; return }
        Task {
            isSaving = true
            saveError = nil
            do {
                if resultIsQuiz { try await saveQuizHistory(setId: setId, historyId: historyId) }
                else { try await saveFlashcardHistory(setId: setId, historyId: historyId) }
            } catch {
                saveError = error.localizedDescription
                isSaving = false
            }
        }
    }

    private func saveQuizHistory(setId: String, historyId: String) async throws {
        let r: SaveHistoryResult = try await api.postJSON(
            "/quizsets/save-history-to-quizset",
            body: SaveHistoryToQuizsetBody(quizsetIds: [setId], historyId: historyId),
        )
        savedCount = r.createdCount
        isSaving = false
    }

    private func saveFlashcardHistory(setId: String, historyId: String) async throws {
        let r: SaveHistoryResult = try await api.postJSON(
            "/flashcardsets/save-history-to-flashcardset",
            body: SaveHistoryToFlashcardSetBody(flashcardsetIds: [setId], historyId: historyId),
        )
        savedCount = r.createdCount
        isSaving = false
    }
}
