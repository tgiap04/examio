import SwiftUI

struct AiView: View {
    @State private var state = AiUiState()

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("AI")
                    .font(.system(size: 34, weight: .regular, design: .serif))
                    .foregroundStyle(Color.examioInk)
                Picker("AI", selection: $state.selectedSection) {
                    ForEach(AiSection.allCases, id: \.self) { section in
                        Text(section.label).tag(section)
                    }
                }
                .pickerStyle(.segmented)

                switch state.selectedSection {
                case .teacher:
                    aiChatView
                case .tool:
                    aiToolView
                case .history:
                    aiHistoryView
                }
            }
            .padding(24)
            .background(Color.examioCanvas)
            .navigationTitle("AI")
        }
    }

    private var aiChatView: some View {
        VStack(spacing: 12) {
            ScrollView {
                VStack(spacing: 10) {
                    ForEach(state.messages) { message in
                        ChatMessageBubble(message: message)
                    }
                }
            }
            TextField("Nhập câu hỏi cho giáo viên AI", text: $state.input, axis: .vertical)
                .textFieldStyle(.roundedBorder)
            Button("Gửi") { sendMessage() }
                .buttonStyle(.borderedProminent)
                .tint(.examioPrimary)
                .frame(maxWidth: .infinity)
        }
    }

    private var aiToolView: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Tạo học liệu từ PDF")
                .font(.title3.weight(.medium))
                .foregroundStyle(Color.examioInk)
            VStack(alignment: .leading, spacing: 10) {
                Text("Loại tạo: \(state.generatorType)")
                Text("Số lượng gợi ý: \(state.generatedCount)")
                Text("Tải PDF qua document picker khi nối native file picker.")
                    .foregroundStyle(.secondary)
                HStack {
                    Button("Chọn PDF") {}
                        .buttonStyle(.bordered)
                    Button("Tạo") {}
                        .buttonStyle(.borderedProminent)
                        .tint(.examioPrimary)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.examioCard)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            Spacer()
        }
    }

    private var aiHistoryView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Lịch sử")
                .font(.title3.weight(.medium))
                .foregroundStyle(Color.examioInk)
            ForEach(state.history) { item in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(item.title)
                            .font(.headline)
                            .foregroundStyle(Color.examioInk)
                        Spacer()
                        Text(item.status)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Color.examioPrimary)
                    }
                    Text(item.detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(16)
                .background(Color.examioCard)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            Spacer()
        }
    }

    private func sendMessage() {
        let text = state.input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        state.input = ""
        state.messages.append(.init(text: text, isUser: true))
        state.messages.append(.init(text: "Mình đã ghi nhận. Khi nối SSE, phản hồi sẽ stream từng đoạn tại đây.", isUser: false))
    }
}

private enum AiSection: CaseIterable {
    case teacher
    case tool
    case history

    var label: String {
        switch self {
        case .teacher: "Giáo viên AI"
        case .tool: "Tạo đề"
        case .history: "Lịch sử"
        }
    }
}

private struct AiUiState {
    var selectedSection: AiSection = .teacher
    var messages: [AiChatMessage] = [
        .init(text: "Em muốn ôn phần nào hôm nay?", isUser: false),
        .init(text: "Giúp em tạo lộ trình ôn thi ngắn.", isUser: true),
        .init(text: "Bắt đầu với mục tiêu, thời gian còn lại và bộ tài liệu em đã tải lên.", isUser: false),
    ]
    var input = ""
    let generatorType = "Flashcard + Quiz"
    let generatedCount = 12
    let history: [AiHistoryItem] = [
        .init(title: "chuong-1.pdf", status: "Đã xử lý", detail: "8 flashcard · 1 bộ quiz"),
        .init(title: "Đề luyện tổng hợp", status: "Hoàn thành", detail: "Điểm gần nhất 8.5"),
    ]
}

private struct AiChatMessage: Identifiable {
    let id = UUID()
    let text: String
    let isUser: Bool
}

private struct AiHistoryItem: Identifiable {
    let id = UUID()
    let title: String
    let status: String
    let detail: String
}

private struct ChatMessageBubble: View {
    let message: AiChatMessage

    var body: some View {
        HStack {
            if message.isUser { Spacer(minLength: 44) }
            Text(message.text)
                .font(.body)
                .foregroundStyle(Color.examioInk)
                .padding(14)
                .background(message.isUser ? Color.examioPrimary.opacity(0.16) : Color.examioCard)
                .clipShape(RoundedRectangle(cornerRadius: 18))
            if !message.isUser { Spacer(minLength: 44) }
        }
    }
}
