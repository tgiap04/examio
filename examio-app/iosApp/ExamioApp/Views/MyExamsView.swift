import SwiftUI

struct MyExamsView: View {
    @State private var state = MyExamsUiState()

    var body: some View {
        NavigationStack {
            Group {
                if state.isResultVisible {
                    examResultView
                } else if state.isTakingQuiz {
                    examQuizView
                } else if state.selectedAttemptId != nil {
                    examSessionView
                } else {
                    examsListView
                }
            }
            .background(Color.examioCanvas)
            .navigationTitle("Thi của tôi")
        }
    }

    private var examsListView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Thi của tôi")
                        .font(.system(size: 34, weight: .regular, design: .serif))
                        .foregroundStyle(Color.examioInk)
                    Text("Quản lý phòng thi, tiếp tục lượt làm bài và xem kết quả gần đây.")
                        .foregroundStyle(.secondary)
                }

                ForEach(state.attempts) { attempt in
                    ExamAttemptRow(
                        attempt: attempt,
                        onOpen: { state.selectedAttemptId = attempt.id },
                        onTogglePin: { togglePin(attempt) }
                    )
                }
            }
            .padding(24)
        }
    }

    private var examSessionView: some View {
        VStack(alignment: .leading, spacing: 18) {
            Button("← Danh sách") { state.selectedAttemptId = nil }
                .foregroundStyle(Color.examioPrimary)
            Text(state.selectedAttempt?.title ?? "Phòng thi")
                .font(.system(size: 30, weight: .regular, design: .serif))
                .foregroundStyle(Color.examioInk)
            Text(state.selectedAttempt?.description ?? "")
                .foregroundStyle(.secondary)
            if let attempt = state.selectedAttempt {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(attempt.questionCount) câu hỏi")
                    Text("Thời lượng \(attempt.durationMinutes) phút")
                    Text("Trạng thái: \(attempt.status.label)")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(Color.examioCard)
                .clipShape(RoundedRectangle(cornerRadius: 18))
            }
            Button("Bắt đầu làm bài") { startQuiz() }
                .buttonStyle(.borderedProminent)
                .tint(.examioPrimary)
            Spacer()
        }
        .padding(24)
    }

    private var examQuizView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Còn 44:12")
                .font(.caption.weight(.medium))
                .foregroundStyle(Color.examioPrimary)
            ProgressView(value: Double(state.currentQuestionIndex + 1), total: Double(state.questions.count))
                .tint(.examioPrimary)
            Text("Câu \(state.currentQuestionIndex + 1)")
                .font(.title3.weight(.medium))
                .foregroundStyle(Color.examioInk)
            if let currentQuestion = state.currentQuestion {
                QuestionCardView(
                    question: currentQuestion,
                    selectedOption: state.answers[state.currentQuestionIndex],
                    onSelectAnswer: selectAnswer
                )
            } else {
                Text("Chưa có câu hỏi nào trong bài thi.")
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                Button("Trước") { previousQuestion() }
                    .buttonStyle(.bordered)
                    .disabled(state.currentQuestionIndex == 0)
                Button("Tiếp") { nextQuestion() }
                    .buttonStyle(.borderedProminent)
                    .tint(.examioPrimary)
                    .disabled(state.currentQuestionIndex == state.questions.count - 1)
            }
            Button("Nộp bài") { state.isResultVisible = true; state.isTakingQuiz = false }
                .buttonStyle(.borderedProminent)
                .tint(.examioPrimary)
                .disabled(!state.hasAnsweredAllQuestions)
            Spacer()
        }
        .padding(24)
    }

    private var examResultView: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("Hoàn thành")
                .font(.system(size: 34, weight: .regular, design: .serif))
                .foregroundStyle(Color.examioInk)
            Text("\(state.answeredCount)/\(state.questions.count) câu đã trả lời")
                .foregroundStyle(.secondary)
            Text("Kết quả chi tiết sẽ hiển thị sau khi nối API chấm điểm.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button("Về danh sách") { state = MyExamsUiState() }
                .buttonStyle(.borderedProminent)
                .tint(.examioPrimary)
            Spacer()
        }
        .padding(24)
    }

    private func togglePin(_ attempt: ExamAttempt) {
        state.attempts = state.attempts.map { item in
            item.id == attempt.id ? item.toggledPin() : item
        }
    }

    private func startQuiz() {
        state.isTakingQuiz = true
        state.currentQuestionIndex = 0
        state.answers = [:]
    }

    private func selectAnswer(_ index: Int) {
        state.answers[state.currentQuestionIndex] = index
    }

    private func nextQuestion() {
        state.currentQuestionIndex = min(state.currentQuestionIndex + 1, state.questions.count - 1)
    }

    private func previousQuestion() {
        state.currentQuestionIndex = max(state.currentQuestionIndex - 1, 0)
    }
}

private enum ExamStatus {
    case inProgress
    case completed
    case upcoming

    var label: String {
        switch self {
        case .inProgress: "Đang làm"
        case .completed: "Hoàn thành"
        case .upcoming: "Sẵn sàng"
        }
    }
}

private struct MyExamsUiState {
    var attempts: [ExamAttempt] = [
        .init(id: "mock-entrance", title: "Đề luyện tổng hợp", description: "Phòng thi mô phỏng trải nghiệm Examio web với đồng hồ và lưu tiến độ.", status: .upcoming, score: "--", date: "Hôm nay", questionCount: 3, durationMinutes: 45, isPinned: true),
        .init(id: "mock-review", title: "Ôn tập chương 1", description: "Bài thi ngắn để kiểm tra kiến thức nền tảng.", status: .completed, score: "8.5", date: "2 ngày trước", questionCount: 2, durationMinutes: 15, isPinned: false),
    ]
    var selectedAttemptId: String?
    var isTakingQuiz = false
    var currentQuestionIndex = 0
    var answers: [Int: Int] = [:]
    var isResultVisible = false
    let questions: [ExamQuestion] = [
        .init(prompt: "Khi làm bài trên mobile, dữ liệu nào cần lưu định kỳ?", options: ["Màu theme", "Câu trả lời hiện tại", "Tên tab", "Font chữ"]),
        .init(prompt: "Timer nên hiển thị ở đâu?", options: ["Cuối trang", "Trong lobby", "Nổi bật trên màn hình làm bài", "Ẩn đi"]),
        .init(prompt: "Trước khi nộp bài nên có bước nào?", options: ["Xóa đáp án", "Xác nhận nộp", "Đăng xuất", "Đổi đề"]),
    ]

    var selectedAttempt: ExamAttempt? {
        attempts.first { $0.id == selectedAttemptId }
    }

    var currentQuestion: ExamQuestion? {
        guard questions.indices.contains(currentQuestionIndex) else { return nil }
        return questions[currentQuestionIndex]
    }

    var answeredCount: Int {
        Set(answers.keys).count
    }

    var hasAnsweredAllQuestions: Bool {
        Set(answers.keys) == Set(questions.indices)
    }
}

private struct ExamAttempt: Identifiable {
    let id: String
    let title: String
    let description: String
    let status: ExamStatus
    let score: String
    let date: String
    let questionCount: Int
    let durationMinutes: Int
    let isPinned: Bool

    func toggledPin() -> ExamAttempt {
        ExamAttempt(id: id, title: title, description: description, status: status, score: score, date: date, questionCount: questionCount, durationMinutes: durationMinutes, isPinned: !isPinned)
    }
}

private struct ExamQuestion {
    let prompt: String
    let options: [String]
}

private struct ExamAttemptRow: View {
    let attempt: ExamAttempt
    let onOpen: () -> Void
    let onTogglePin: () -> Void

    var body: some View {
        Button {
            onOpen()
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(attempt.status.label)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Color.examioPrimary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color.examioPrimary.opacity(0.14))
                        .clipShape(Capsule())
                    Spacer()
                    Button(attempt.isPinned ? "Đã ghim" : "Ghim", action: onTogglePin)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Color.examioPrimary)
                }
                Text(attempt.title)
                    .font(.headline)
                    .foregroundStyle(Color.examioInk)
                Text(attempt.description)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                HStack(spacing: 12) {
                    Text("\(attempt.questionCount) câu")
                    Text("\(attempt.durationMinutes) phút")
                    Text("Điểm \(attempt.score)")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            .padding(16)
            .background(Color.examioCard)
            .clipShape(RoundedRectangle(cornerRadius: 18))
        }
        .buttonStyle(.plain)
    }
}

private struct QuestionCardView: View {
    let question: ExamQuestion
    let selectedOption: Int?
    let onSelectAnswer: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(question.prompt)
                .font(.headline)
                .foregroundStyle(Color.examioInk)
            ForEach(question.options.indices, id: \.self) { index in
                Button {
                    onSelectAnswer(index)
                } label: {
                    HStack {
                        Image(systemName: selectedOption == index ? "largecircle.fill.circle" : "circle")
                            .foregroundStyle(Color.examioPrimary)
                        Text(question.options[index])
                            .foregroundStyle(Color.examioInk)
                        Spacer()
                    }
                    .padding(12)
                    .background(Color.white.opacity(selectedOption == index ? 0.75 : 0.45))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .background(Color.examioCard)
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }
}
