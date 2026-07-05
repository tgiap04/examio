import SwiftUI

struct StudyView: View {
    @StateObject private var materialsVM = MyMaterialsViewModel()
    @State private var selectedSetId: String?
    @State private var showAi = false

    var body: some View {
        Group {
            if let setId = selectedSetId {
                FlashcardSetDetailView(setId: setId, onBack: { selectedSetId = nil })
            } else {
                MyMaterialsView(vm: materialsVM, onOpenSet: { selectedSetId = $0 }, onGenerateWithAi: { showAi = true })
            }
        }
        .background(Color.examioCanvas)
        .sheet(isPresented: $showAi) {
            AiView(initialTypeResult: 2, onClose: { showAi = false })
        }
    }
}

// MARK: - My Materials

private struct MyMaterialsView: View {
    @ObservedObject var vm: MyMaterialsViewModel
    let onOpenSet: (String) -> Void
    let onGenerateWithAi: () -> Void

    var body: some View {
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

                Button(action: onGenerateWithAi) {
                    Label("Tạo flashcard bằng AI", systemImage: "sparkles")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.examioPrimary)

                if vm.isLoading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if let err = vm.errorMessage {
                    VStack(spacing: 8) {
                        Text(err).font(.caption).foregroundStyle(.red)
                        Button("Thử lại") { Task { await vm.load() } }.buttonStyle(.bordered)
                    }
                } else {
                    ForEach(vm.sets) { set in
                        FlashcardSetRow(set: set, onOpen: { onOpenSet(set.id) }, onTogglePin: { vm.togglePin(id: set.id) })
                    }
                }
            }
            .padding(24)
        }
    }
}

private struct FlashcardSetRow: View {
    let set: RecentFlashcardSetItem
    let onOpen: () -> Void
    let onTogglePin: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 14) {
                VStack(spacing: 0) {
                    Text("\(set.flashcardCount)").font(.title2.weight(.medium))
                    Text("thẻ").font(.caption2)
                }
                .foregroundStyle(Color.examioPrimary)
                .frame(width: 58, height: 58)
                .background(Color.examioPrimary.opacity(0.14))
                .clipShape(RoundedRectangle(cornerRadius: 16))

                VStack(alignment: .leading, spacing: 4) {
                    Text(set.title).font(.headline).foregroundStyle(Color.examioInk)
                    if let desc = set.description {
                        Text(desc).font(.footnote).foregroundStyle(.secondary)
                    }
                    if let viewed = set.lastViewedAt {
                        Text(viewed).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button(set.isPinned ? "Đã ghim" : "Ghim", action: onTogglePin)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Color.examioPrimary)
            }
            .padding(16)
            .examioCard(cornerRadius: 18)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Flashcard Set Detail

private struct FlashcardSetDetailView: View {
    let setId: String
    let onBack: () -> Void
    @StateObject private var vm: FlashcardSetDetailViewModel

    init(setId: String, onBack: @escaping () -> Void) {
        self.setId = setId
        self.onBack = onBack
        _vm = StateObject(wrappedValue: FlashcardSetDetailViewModel(setId: setId))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Button("← Tài liệu", action: onBack).foregroundStyle(Color.examioPrimary)

            if vm.isLoading {
                Spacer()
                HStack { Spacer(); ProgressView(); Spacer() }
                Spacer()
            } else if vm.isDenied {
                FlashcardDeniedContent(onBack: onBack)
            } else if let err = vm.errorMessage {
                Text(err).font(.caption).foregroundStyle(.red)
                Button("Thử lại") { Task { await vm.load() } }.buttonStyle(.bordered)
            } else {
                Text(vm.study?.title ?? "Flashcard")
                    .font(.system(size: 28, weight: .regular, design: .serif))
                    .foregroundStyle(Color.examioInk)

                let total = max(vm.cards.count, 1)
                ProgressView(value: Double(vm.studyIndex + 1), total: Double(total))
                    .tint(.examioPrimary)

                if let card = vm.currentCard {
                    FlashcardCardView(
                        question: card.question,
                        answer: card.answer,
                        isAnswerVisible: vm.isAnswerVisible,
                        onFlip: { vm.flipCard() }
                    )
                } else {
                    Text("Chưa có thẻ nào trong bộ này.").foregroundStyle(.secondary)
                }

                HStack(spacing: 12) {
                    Button("Trước") { vm.previousCard() }
                        .buttonStyle(.bordered)
                        .disabled(vm.studyIndex == 0)
                    Button("Tiếp") { vm.nextCard() }
                        .buttonStyle(.borderedProminent)
                        .tint(.examioPrimary)
                        .disabled(vm.studyIndex >= vm.cards.count - 1)
                }

                Text("\(vm.studyIndex + 1)/\(vm.cards.count) · Chạm thẻ để lật")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(24)
        .sheet(isPresented: $vm.requiresCode, onDismiss: {
            // Swipe-dismiss bypasses onCancel; if no set was unlocked, exit the dead state.
            if vm.study == nil { onBack() }
        }) {
            FlashcardCodeSheet(
                isSubmitting: vm.isSubmittingCode,
                codeError: vm.codeError,
                onSubmit: { vm.submitCode($0) },
                onCancel: { vm.requiresCode = false }
            )
        }
    }
}

private struct FlashcardCardView: View {
    let question: String
    let answer: String
    let isAnswerVisible: Bool
    let onFlip: () -> Void

    var body: some View {
        Button(action: onFlip) {
            VStack(spacing: 14) {
                Text(isAnswerVisible ? "Câu trả lời" : "Câu hỏi")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Color.examioPrimary)
                Text(isAnswerVisible ? answer : question)
                    .font(.title3)
                    .foregroundStyle(Color.examioInk)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, minHeight: 260)
            .padding(22)
            .examioCard(cornerRadius: 24)
        }
        .buttonStyle(.plain)
    }
}
