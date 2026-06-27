import SwiftUI

struct HomeView: View {
    private let state = HomeDashboardState()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Trang chủ")
                            .font(.system(size: 34, weight: .regular, design: .serif))
                            .foregroundStyle(Color.examioInk)
                        Text("Theo dõi nhịp học, tài liệu gần đây và các kỳ thi cần tiếp tục.")
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }

                    LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 12) {
                        ForEach(state.stats) { stat in
                            StatsCardView(stat: stat)
                        }
                    }

                    RecentSection(title: "Flashcard gần đây", emptyText: "Chưa có bộ flashcard nào.", isEmpty: state.recentFlashcards.isEmpty) {
                        ForEach(state.recentFlashcards) { item in
                            RecentFlashcardRow(item: item)
                        }
                    }

                    RecentSection(title: "Bài thi gần đây", emptyText: "Chưa có lượt thi nào.", isEmpty: state.recentExams.isEmpty) {
                        ForEach(state.recentExams) { item in
                            RecentExamRow(item: item)
                        }
                    }
                }
                .padding(24)
            }
            .background(Color.examioCanvas)
            .navigationTitle("Trang chủ")
        }
    }
}

private struct HomeDashboardState {
    let stats: [HomeStat] = [
        .init(label: "Tài liệu", value: "0", hint: "PDF đã xử lý"),
        .init(label: "Bài thi", value: "0", hint: "lượt đã làm"),
        .init(label: "Flashcard", value: "0", hint: "bộ đang học"),
        .init(label: "Giờ học", value: "0", hint: "trong tuần"),
    ]
    let recentFlashcards: [HomeRecentFlashcard] = []
    let recentExams: [HomeRecentExam] = []
}

private struct HomeStat: Identifiable {
    let id = UUID()
    let label: String
    let value: String
    let hint: String
}

private struct HomeRecentFlashcard: Identifiable {
    let id = UUID()
    let title: String
    let cardCount: Int
}

private struct HomeRecentExam: Identifiable {
    let id = UUID()
    let title: String
    let score: String
    let date: String
}

private struct StatsCardView: View {
    let stat: HomeStat

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(stat.value)
                .font(.system(size: 28, weight: .regular, design: .serif))
                .foregroundStyle(Color.examioPrimary)
            Text(stat.label)
                .font(.headline)
                .foregroundStyle(Color.examioInk)
            Text(stat.hint)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .examioCard(cornerRadius: 16)
    }
}

private struct RecentSection<Content: View>: View {
    let title: String
    let emptyText: String
    let isEmpty: Bool
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.title3.weight(.medium))
                .foregroundStyle(Color.examioInk)
            content
            if isEmpty {
                Text(emptyText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct RecentFlashcardRow: View {
    let item: HomeRecentFlashcard

    var body: some View {
        Text("\(item.title) · \(item.cardCount) thẻ")
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.examioSurfaceSoft)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.examioHairline, lineWidth: 1)
            )
    }
}

private struct RecentExamRow: View {
    let item: HomeRecentExam

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(item.title)
                Text(item.date).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(item.score).foregroundStyle(Color.examioPrimary)
        }
        .padding(14)
        .background(Color.examioSurfaceSoft)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.examioHairline, lineWidth: 1)
        )
    }
}
