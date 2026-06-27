import SwiftUI

struct ContentView: View {
    @StateObject private var authViewModel = AuthViewModel()
    @State private var selectedTab: AppTab = .taiLieu
    @State private var showsProfile = false

    var body: some View {
        if authViewModel.isAuthenticated {
            VStack(spacing: 0) {
                AppHeaderView { showsProfile = true }
                TabView(selection: $selectedTab) {
                    StudyView()
                        .tabItem { Label("Tài liệu", systemImage: "book") }
                        .tag(AppTab.taiLieu)

                    MyExamsView()
                        .tabItem { Label("Bài thi", systemImage: "graduationcap") }
                        .tag(AppTab.baiThi)

                    DeThiView()
                        .tabItem { Label("Đề thi", systemImage: "doc.text") }
                        .tag(AppTab.deThi)

                    HistoryView()
                        .tabItem { Label("Lịch sử", systemImage: "clock.arrow.circlepath") }
                        .tag(AppTab.lichSu)
                }
                .tint(.examioPrimary)
            }
            .sheet(isPresented: $showsProfile) {
                AccountView(onDismiss: { showsProfile = false })
            }
            .onOpenURL { url in
                if let deepLink = parseAppDeepLink(url) {
                    selectedTab = deepLink.targetTab
                }
            }
        } else {
            AuthFlowView(viewModel: authViewModel)
        }
    }
}

private struct AppHeaderView: View {
    let onProfileTap: () -> Void

    var body: some View {
        HStack {
            Image("ExamioLogo")
                .resizable()
                .scaledToFit()
                .frame(height: 30)
            Spacer()
            Button(action: onProfileTap) {
                Image(systemName: "person.crop.circle")
                    .font(.title2)
                    .foregroundStyle(Color.examioPrimary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(Color.examioCanvas)
    }
}


struct DeThiView: View {
    private let examSets = ["Ôn tập Toán cao cấp", "Kiểm tra Sinh học 12", "Đề luyện tiếng Anh B1"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Đề thi").font(.largeTitle.bold()).foregroundStyle(Color.examioInk)
                Text("Quản lý bộ đề, flashcard và phòng thi từ một nơi.").foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    StatTile(value: "24", label: "Bộ đề")
                    StatTile(value: "312", label: "Câu hỏi")
                }
                HStack(spacing: 10) {
                    SecondaryAction(title: "Flash Card", icon: "rectangle.stack")
                    SecondaryAction(title: "Phòng thi", icon: "person.3")
                }
                ForEach(examSets, id: \.self) { item in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(item).font(.headline).foregroundStyle(Color.examioInk)
                        Text("32 câu hỏi • Đang hoạt động • Cập nhật hôm nay").font(.subheadline).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color.examioCard, in: RoundedRectangle(cornerRadius: 18))
                }
                Button { } label: {
                    Label("Tạo bộ đề", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                        .padding()
                }
                .background(Color.examioPrimary, in: RoundedRectangle(cornerRadius: 16))
                .foregroundStyle(.white)
            }
            .padding(20)
        }
        .background(Color.examioCanvas)
    }
}

private struct StatTile: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value).font(.title.bold()).foregroundStyle(Color.examioPrimary)
            Text(label).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.examioCard, in: RoundedRectangle(cornerRadius: 18))
    }
}

private struct SecondaryAction: View {
    let title: String
    let icon: String

    var body: some View {
        Label(title, systemImage: icon)
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.examioPrimary.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(Color.examioPrimary)
    }
}

struct HistoryView: View {
    @StateObject private var vm = HistoryViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Lịch sử")
                        .font(.system(size: 34, weight: .regular, design: .serif))
                        .foregroundStyle(Color.examioInk)
                    Text("Theo dõi hoạt động học tập, tài liệu và kết quả gần đây.")
                        .foregroundStyle(.secondary)
                }

                if vm.isLoading {
                    HStack { Spacer(); ProgressView(); Spacer() }.padding(.top, 32)
                } else if let err = vm.error {
                    VStack(spacing: 8) {
                        Text(err).font(.caption).foregroundStyle(.red)
                        Button("Thử lại") { Task { await vm.load() } }.buttonStyle(.bordered)
                    }
                } else {
                    if let stats = vm.stats {
                        LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 10) {
                            HistoryStatTile(value: "\(stats.totalPDFs)", label: "PDF")
                            HistoryStatTile(value: "\(stats.examsCreated)", label: "Bài thi")
                            HistoryStatTile(value: "\(stats.flashcardSets)", label: "Flashcard")
                            HistoryStatTile(value: "\(stats.totalStudyHours)h", label: "Tự học")
                        }
                    }

                    if !vm.pdfs.isEmpty {
                        Text("Tài liệu PDF").font(.headline).foregroundStyle(Color.examioInk)
                        ForEach(vm.pdfs) { pdf in
                            PDFHistoryRow(item: pdf)
                        }
                    }

                    if !vm.exams.isEmpty {
                        Text("Bài thi gần đây").font(.headline).foregroundStyle(Color.examioInk)
                        ForEach(vm.exams) { exam in
                            ExamHistoryRow(item: exam)
                        }
                    }
                }
            }
            .padding(20)
        }
        .background(Color.examioCanvas)
    }
}

private struct HistoryStatTile: View {
    let value: String
    let label: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value).font(.title.bold()).foregroundStyle(Color.examioPrimary)
            Text(label).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.examioCard, in: RoundedRectangle(cornerRadius: 18))
    }
}

private struct PDFHistoryRow: View {
    let item: PDFHistoryItemResponse
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(item.filename).font(.headline).foregroundStyle(Color.examioInk)
                Spacer()
                if let status = item.processingStatus {
                    Text(status).font(.caption.weight(.medium)).foregroundStyle(Color.examioPrimary)
                }
            }
            let detail = buildDetail()
            if !detail.isEmpty {
                Text(detail).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.examioCard, in: RoundedRectangle(cornerRadius: 18))
    }

    private func buildDetail() -> String {
        var parts: [String] = []
        if let q = item.quizHistory { parts.append("\(q.quizCount) quiz") }
        if let f = item.flashcardHistory { parts.append("\(f.flashcardCount) flashcard") }
        return parts.joined(separator: " · ")
    }
}

private struct ExamHistoryRow: View {
    let item: ExamHistoryItemResponse
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.examSession?.examRoom?.title ?? "Bài thi")
                .font(.headline).foregroundStyle(Color.examioInk)
            HStack(spacing: 10) {
                Text("\(item.correctAnswers)/\(item.totalQuestions) đúng")
                    .font(.caption).foregroundStyle(Color.examioPrimary)
                if let score = item.score {
                    Text(String(format: "%.1f điểm", score))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.examioCard, in: RoundedRectangle(cornerRadius: 18))
    }
}

