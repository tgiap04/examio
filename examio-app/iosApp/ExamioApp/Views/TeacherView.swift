import SwiftUI

struct TeacherView: View {
    @State private var state = TeacherUiState()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Quản lý giảng dạy")
                        .font(.system(size: 34, weight: .regular, design: .serif))
                        .foregroundStyle(Color.examioInk)
                    Text("Khu vực role Teacher để quản lý flashcard, quiz và phòng thi.")
                        .foregroundStyle(.secondary)
                    Picker("Loại nội dung", selection: $state.selectedType) {
                        ForEach(TeacherContentType.allCases, id: \.self) { type in
                            Text(type.label).tag(type)
                        }
                    }
                    .pickerStyle(.segmented)
                    Button("Tạo \(state.selectedType.label)") {}
                        .buttonStyle(.borderedProminent)
                        .tint(.examioPrimary)
                    ForEach(state.currentItems) { item in
                        TeacherContentCard(item: item)
                    }
                }
                .padding(24)
            }
            .background(Color.examioCanvas)
            .navigationTitle("Giảng dạy")
        }
    }
}

private enum TeacherContentType: CaseIterable {
    case flashcards
    case quizSets
    case examRooms

    var label: String {
        switch self {
        case .flashcards: "Flashcard"
        case .quizSets: "Quiz"
        case .examRooms: "Phòng thi"
        }
    }
}

private struct TeacherUiState {
    var selectedType: TeacherContentType = .flashcards
    let flashcardSets: [TeacherContentItem] = [
        .init(title: "Từ vựng trọng tâm", description: "Bộ flashcard dùng cho lớp luyện đề.", countLabel: "32 thẻ", status: "Công khai"),
        .init(title: "Công thức nhanh", description: "Các công thức cần ghi nhớ trước kỳ thi.", countLabel: "18 thẻ", status: "Riêng tư"),
    ]
    let quizSets: [TeacherContentItem] = [
        .init(title: "Quiz chương 1", description: "Câu hỏi trắc nghiệm nền tảng.", countLabel: "24 câu", status: "Đang dùng"),
        .init(title: "Mini test cuối tuần", description: "Bộ đề kiểm tra ngắn.", countLabel: "12 câu", status: "Nháp"),
    ]
    let examRooms: [TeacherContentItem] = [
        .init(title: "Lớp 12A - Luyện đề", description: "Phòng thi có lịch mở theo tuần.", countLabel: "3 phiên", status: "Hoạt động"),
        .init(title: "Thi thử cuối khóa", description: "Phòng thi tổng hợp có giới hạn thời gian.", countLabel: "1 phiên", status: "Sắp mở"),
    ]

    var currentItems: [TeacherContentItem] {
        switch selectedType {
        case .flashcards: flashcardSets
        case .quizSets: quizSets
        case .examRooms: examRooms
        }
    }
}

private struct TeacherContentItem: Identifiable {
    let id = UUID()
    let title: String
    let description: String
    let countLabel: String
    let status: String
}

private struct TeacherContentCard: View {
    let item: TeacherContentItem

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(item.status)
                    .foregroundStyle(Color.examioPrimary)
                Text("· \(item.countLabel)")
                    .foregroundStyle(.secondary)
            }
            .font(.caption.weight(.medium))
            Text(item.title)
                .font(.headline)
                .foregroundStyle(Color.examioInk)
            Text(item.description)
                .font(.footnote)
                .foregroundStyle(.secondary)
            HStack {
                Button("Chi tiết") {}
                    .buttonStyle(.bordered)
                Button("Sửa") {}
                    .buttonStyle(.bordered)
            }
        }
        .padding(16)
        .background(Color.examioCard)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}
