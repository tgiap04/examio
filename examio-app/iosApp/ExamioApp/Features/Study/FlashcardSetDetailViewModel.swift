import Foundation

struct FlashcardSetDetail: Decodable {
    let id: String
    let title: String
    let description: String?
    let thumbnail: String?
    let flashcardCount: Int
    let isPublic: Bool
    let isPinned: Bool
}

struct FlashcardCard: Decodable, Identifiable {
    let id: String
    let question: String
    let answer: String
    let image: String?
    let flashcardSetId: String?
}

struct FlashcardCardsResponse: Decodable {
    let flashCards: [FlashcardCard]
}

@MainActor
final class FlashcardSetDetailViewModel: ObservableObject {
    @Published var set: FlashcardSetDetail?
    @Published var cards: [FlashcardCard] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var studyIndex = 0
    @Published var isAnswerVisible = false

    private let setId: String
    private let api = ExamioAPIClient.shared

    init(setId: String) {
        self.setId = setId
        Task { await load() }
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            async let setResult: FlashcardSetDetail = api.get("/flashcardsets/\(setId)")
            async let cardsResult: FlashcardCardsResponse = api.get("/flashcardsets/\(setId)/flashcards", query: ["page": "1", "limit": "100"])
            set = try await setResult
            cards = (try? await cardsResult)?.flashCards ?? []
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
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
