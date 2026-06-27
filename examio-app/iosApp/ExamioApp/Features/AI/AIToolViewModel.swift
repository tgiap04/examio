import Foundation

// MARK: - Models

struct RecentUploadItem: Decodable, Identifiable {
    let id: String
    let filename: String
    let processingStatus: String?
    let createdAt: String?
    let quizHistory: UploadQuizSummary?
    let flashcardHistory: UploadFlashcardSummary?
}

struct UploadQuizSummary: Decodable {
    let quizCount: Int
}

struct UploadFlashcardSummary: Decodable {
    let flashcardCount: Int
}

struct GenerateJobResponse: Decodable {
    let jobId: String
}

struct JobStatusResponse: Decodable {
    let jobId: String
    let status: String      // PENDING | RUNNING | DONE | FAILED | CANCELLED
    let progress: Int?
    let message: String?
    let error: String?
}

struct AIChatMessageItem: Identifiable {
    let id = UUID()
    let text: String
    let isUser: Bool
}

struct SendMessageBody: Encodable {
    let chatId: String?
    let content: String
    let documentIds: [String]
}

struct SendMessageResponse: Decodable {
    let id: String
    let chatId: String
    let role: String
    let content: String
}

// MARK: - ViewModel

@MainActor
final class AIToolViewModel: ObservableObject {
    // section
    @Published var selectedSection: AiSection = .teacher
    // chat
    @Published var messages: [AIChatMessageItem] = []
    @Published var input = ""
    @Published var isSending = false
    @Published var chatError: String?
    private var activeChatId: String?
    // generator
    @Published var typeResult: Int = 1        // 1 = quiz, 2 = flashcard
    @Published var quantity: Int = 5
    @Published var keyword = ""
    @Published var selectedFileName: String?
    @Published var isGenerating = false
    @Published var jobStatus: JobStatusResponse?
    @Published var generateError: String?
    private var pendingFileData: Data?
    private var pendingFileName: String?
    // history
    @Published var uploads: [RecentUploadItem] = []
    @Published var uploadsLoading = false
    @Published var uploadsError: String?

    private let api = ExamioAPIClient.shared
    private var pollTask: Task<Void, Never>?

    init() {
        Task { await loadUploads() }
    }

    // ── Chat ──────────────────────────────────────────────────────────────

    func sendMessage() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }
        input = ""
        isSending = true
        chatError = nil
        messages.append(AIChatMessageItem(text: text, isUser: true))

        Task {
            do {
                let body = SendMessageBody(chatId: activeChatId, content: text, documentIds: [])
                let reply: SendMessageResponse = try await api.postJSON("/ai/chat", body: body)
                activeChatId = reply.chatId
                messages.append(AIChatMessageItem(text: reply.content, isUser: false))
            } catch {
                chatError = error.localizedDescription
            }
            isSending = false
        }
    }

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

        Task {
            do {
                var fields: [(String, String)] = [
                    ("typeResult", "\(typeResult)"),
                    (typeResult == 1 ? "quantityQuizz" : "quantityFlashcard", "\(quantity)"),
                    ("isNarrowSearch", "false"),
                ]
                let kw = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
                if !kw.isEmpty { fields.append(("keyword", kw)) }

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
            let timeout: UInt64 = 180_000

            while elapsed < timeout {
                guard !Task.isCancelled else { return }
                try? await Task.sleep(nanoseconds: delayMs * 1_000_000)
                elapsed += delayMs
                delayMs = min(UInt64(Double(delayMs) * 1.5), 10_000)

                guard let status: JobStatusResponse = try? await api.get("/ai/job/\(jobId)") else { continue }
                jobStatus = status
                let terminal = ["DONE", "FAILED", "CANCELLED"]
                if terminal.contains(status.status) {
                    isGenerating = false
                    if status.status == "DONE" { await loadUploads() }
                    return
                }
            }
            jobStatus = JobStatusResponse(jobId: jobId, status: "FAILED", progress: nil, message: nil, error: "Hết thời gian chờ")
            isGenerating = false
        }
    }

    // ── History ───────────────────────────────────────────────────────────

    func loadUploads() async {
        uploadsLoading = true
        uploadsError = nil
        do {
            uploads = try await api.get("/ai/recent-uploads", query: ["limit": "20"])
        } catch {
            uploadsError = error.localizedDescription
        }
        uploadsLoading = false
    }

    func deleteUpload(id: String) {
        Task {
            try? await api.delete("/ai/upload/\(id)")
            await loadUploads()
        }
    }
}

enum AiSection: CaseIterable {
    case teacher, tool, history
    var label: String {
        switch self {
        case .teacher: "Giáo viên AI"
        case .tool: "Tạo đề"
        case .history: "Lịch sử"
        }
    }
}
