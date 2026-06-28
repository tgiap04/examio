import Foundation

struct FlashcardCard: Decodable, Identifiable {
    let id: String
    let question: String
    let answer: String
    let image: String?
    let flashcardSetId: String?
}

/// Server-side access check result (mirrors FE web study page).
struct FlashcardAccessCheck: Decodable {
    let hasAccess: Bool
    let accessType: String
    let requiresCode: Bool?
}

/// Study payload returned by /flashcardsets/study/:id (set fields + cards).
struct FlashcardStudyData: Decodable {
    let id: String
    let title: String
    let description: String?
    let thumbnail: String?
    let isPublic: Bool?
    let cardCount: Int?
    let flashCards: [FlashcardCard]
}

private struct AccessCodeBody: Encodable { let accessCode: String }

@MainActor
final class FlashcardSetDetailViewModel: ObservableObject {
    @Published var study: FlashcardStudyData?
    @Published var cards: [FlashcardCard] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var requiresCode = false
    @Published var isDenied = false
    @Published var isSubmittingCode = false
    @Published var codeError: String?
    @Published var studyIndex = 0
    @Published var isAnswerVisible = false

    private let setId: String
    private let api = ExamioAPIClient.shared

    init(setId: String) {
        self.setId = setId
        Task { await load() }
    }

    /// access check -> study detail; handles owner/public/whitelist/code/denied.
    func load() async {
        isLoading = true
        errorMessage = nil
        requiresCode = false
        isDenied = false
        do {
            let access: FlashcardAccessCheck = try await api.get("/flashcardsets/study/\(setId)/access")
            if access.hasAccess {
                await fetchStudyData()
            } else if access.requiresCode == true || access.accessType == "code_required" {
                requiresCode = true
            } else {
                isDenied = true
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func fetchStudyData() async {
        do {
            let data: FlashcardStudyData = try await api.get("/flashcardsets/study/\(setId)")
            apply(data)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Submit a 6-char access code for a code-protected set.
    func submitCode(_ code: String) {
        guard !isSubmittingCode else { return }
        Task {
            isSubmittingCode = true
            codeError = nil
            do {
                let data: FlashcardStudyData = try await api.postJSON(
                    "/flashcardsets/study/\(setId)/with-code",
                    body: AccessCodeBody(accessCode: code.trimmingCharacters(in: .whitespaces))
                )
                apply(data)
            } catch {
                codeError = error.localizedDescription
            }
            isSubmittingCode = false
        }
    }

    private func apply(_ data: FlashcardStudyData) {
        study = data
        cards = data.flashCards
        requiresCode = false
        isDenied = false
        codeError = nil
        isSubmittingCode = false
        studyIndex = 0
        isAnswerVisible = false
    }

    func flipCard() { isAnswerVisible.toggle() }

    func nextCard() {
        guard studyIndex < cards.count - 1 else { return }
        studyIndex += 1
        isAnswerVisible = false
    }

    func previousCard() {
        guard studyIndex > 0 else { return }
        studyIndex -= 1
        isAnswerVisible = false
    }

    var currentCard: FlashcardCard? { cards.indices.contains(studyIndex) ? cards[studyIndex] : nil }
}
