import SwiftUI

struct StudyView: View {
    @State private var state = StudyUiState()

    var body: some View {
        NavigationStack {
            Group {
                if state.selectedMaterialId == nil {
                    myMaterialsView
                } else {
                    flashcardStudyView
                }
            }
            .background(Color.examioCanvas)
            .navigationTitle(state.selectedMaterialId == nil ? "Học tập" : "Flashcard")
        }
    }

    private var myMaterialsView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Học tập")
                        .font(.system(size: 34, weight: .regular, design: .serif))
                        .foregroundStyle(Color.examioInk)
                    Text("Tiếp tục bộ flashcard gần đây và giữ nhịp ôn luyện mỗi ngày.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                ForEach(state.materials) { material in
                    FlashcardSetRow(
                        material: material,
                        onOpen: { open(material) },
                        onTogglePin: { togglePin(material) }
                    )
                }
            }
            .padding(24)
        }
    }

    private var flashcardStudyView: some View {
        VStack(alignment: .leading, spacing: 18) {
            Button("← Tài liệu") { state.selectedMaterialId = nil }
                .foregroundStyle(Color.examioPrimary)
            Text(state.selectedMaterial?.title ?? "Flashcard")
                .font(.system(size: 28, weight: .regular, design: .serif))
                .foregroundStyle(Color.examioInk)
            ProgressView(value: Double(state.currentCardIndex + 1), total: Double(state.flashcards.count))
                .tint(.examioPrimary)
            if let currentCard = state.currentCard {
                FlashcardCardView(
                    card: currentCard,
                    isAnswerVisible: state.isAnswerVisible,
                    onFlip: { state.isAnswerVisible.toggle() }
                )
            } else {
                Text("Chưa có thẻ nào trong bộ này.")
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                Button("Trước") { previousCard() }
                    .buttonStyle(.bordered)
                    .disabled(state.currentCardIndex == 0)
                Button("Tiếp") { nextCard() }
                    .buttonStyle(.borderedProminent)
                    .tint(.examioPrimary)
                    .disabled(state.currentCardIndex == state.flashcards.count - 1)
            }
            Text("\(state.currentCardIndex + 1)/\(state.flashcards.count) · Chạm thẻ để lật")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(24)
    }

    private func open(_ material: StudyMaterial) {
        state.selectedMaterialId = material.id
        state.currentCardIndex = 0
        state.isAnswerVisible = false
    }

    private func togglePin(_ material: StudyMaterial) {
        state.materials = state.materials.map { item in
            item.id == material.id ? item.toggledPin() : item
        }
    }

    private func nextCard() {
        state.currentCardIndex = min(state.currentCardIndex + 1, state.flashcards.count - 1)
        state.isAnswerVisible = false
    }

    private func previousCard() {
        state.currentCardIndex = max(state.currentCardIndex - 1, 0)
        state.isAnswerVisible = false
    }
}

private struct StudyUiState {
    var materials: [StudyMaterial] = [
        .init(id: "foundation", title: "Nền tảng ôn tập", description: "Bộ thẻ mẫu mô phỏng danh sách học liệu từ web app.", cardCount: 3, lastViewed: "Hôm nay", isPinned: true),
        .init(id: "strategy", title: "Chiến lược làm bài", description: "Các lưu ý ngắn để luyện tốc độ và độ chính xác.", cardCount: 2, lastViewed: "2 ngày trước", isPinned: false),
    ]
    var selectedMaterialId: String?
    var currentCardIndex = 0
    var isAnswerVisible = false

    var selectedMaterial: StudyMaterial? {
        materials.first { $0.id == selectedMaterialId }
    }

    let flashcards: [StudyFlashcard] = [
        .init(question: "Examio dùng tab Học tập để làm gì?", answer: "Theo dõi học liệu, mở flashcard và tiếp tục luyện tập."),
        .init(question: "Khi nối API thật cần lưu ý gì?", answer: "Danh sách dài phải phân trang, refresh rõ ràng và không tải dư dữ liệu."),
        .init(question: "Thiết kế mobile cần giữ cảm giác nào?", answer: "Ấm, editorial, card bo tròn và màu coral tiết chế."),
    ]

    var currentCard: StudyFlashcard? {
        guard flashcards.indices.contains(currentCardIndex) else { return nil }
        return flashcards[currentCardIndex]
    }
}

private struct StudyMaterial: Identifiable {
    let id: String
    let title: String
    let description: String
    let cardCount: Int
    let lastViewed: String
    let isPinned: Bool

    func toggledPin() -> StudyMaterial {
        StudyMaterial(id: id, title: title, description: description, cardCount: cardCount, lastViewed: lastViewed, isPinned: !isPinned)
    }
}

private struct StudyFlashcard {
    let question: String
    let answer: String
}

private struct FlashcardSetRow: View {
    let material: StudyMaterial
    let onOpen: () -> Void
    let onTogglePin: () -> Void

    var body: some View {
        Button {
            onOpen()
        } label: {
            HStack(spacing: 14) {
                VStack(spacing: 0) {
                    Text("\(material.cardCount)")
                        .font(.title2.weight(.medium))
                    Text("thẻ")
                        .font(.caption2)
                }
                .foregroundStyle(Color.examioPrimary)
                .frame(width: 58, height: 58)
                .background(Color.examioPrimary.opacity(0.14))
                .clipShape(RoundedRectangle(cornerRadius: 16))

                VStack(alignment: .leading, spacing: 4) {
                    Text(material.title)
                        .font(.headline)
                        .foregroundStyle(Color.examioInk)
                    Text(material.description)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text(material.lastViewed)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(material.isPinned ? "Đã ghim" : "Ghim", action: onTogglePin)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Color.examioPrimary)
            }
            .padding(16)
            .background(Color.examioCard)
            .clipShape(RoundedRectangle(cornerRadius: 18))
        }
        .buttonStyle(.plain)
    }
}

private struct FlashcardCardView: View {
    let card: StudyFlashcard
    let isAnswerVisible: Bool
    let onFlip: () -> Void

    var body: some View {
        Button {
            onFlip()
        } label: {
            VStack(spacing: 14) {
                Text(isAnswerVisible ? "Câu trả lời" : "Câu hỏi")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Color.examioPrimary)
                Text(isAnswerVisible ? card.answer : card.question)
                    .font(.title3)
                    .foregroundStyle(Color.examioInk)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, minHeight: 260)
            .padding(22)
            .background(Color.examioCard)
            .clipShape(RoundedRectangle(cornerRadius: 24))
        }
        .buttonStyle(.plain)
    }
}
