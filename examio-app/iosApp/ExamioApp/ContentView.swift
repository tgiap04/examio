import SwiftUI

struct ContentView: View {
    @StateObject private var authViewModel = AuthViewModel()
    @State private var selectedTab: AppTab = .aiTool
    @State private var showsProfile = false

    var body: some View {
        if authViewModel.isAuthenticated {
            VStack(spacing: 0) {
                AppHeaderView { showsProfile = true }
                TabView(selection: $selectedTab) {
                    AIToolView()
                        .tabItem { Label("AI", systemImage: "sparkles") }
                        .tag(AppTab.aiTool)

                    StudyView()
                        .tabItem { Label("Tài liệu", systemImage: "book") }
                        .tag(AppTab.taiLieu)

                    MyExamsView()
                        .tabItem { Label("Bài thi", systemImage: "graduationcap") }
                        .tag(AppTab.baiThi)

                    DeThiView()
                        .tabItem { Label("Đề thi", systemImage: "doc.text") }
                        .tag(AppTab.deThi)

                    LichSuView()
                        .tabItem { Label("Lịch sử", systemImage: "clock.arrow.circlepath") }
                        .tag(AppTab.lichSu)
                }
                .tint(.examioPrimary)
            }
            .sheet(isPresented: $showsProfile) { ProfileSheet() }
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


// New tab views live here so the existing Xcode project compiles without project-file churn.

struct AIToolView: View {
    @State private var selectedTypes: Set<String> = ["Trắc nghiệm"]
    @State private var count = "5"
    @State private var keywords = ""
    @State private var generated = false

    private let types = ["Trắc nghiệm", "Điền từ", "Đúng/Sai", "Điền đoạn", "Đáp án đúp", "Biểu mẫu"]
    private let questions = ["Khái niệm chính của tài liệu này là gì?", "Yếu tố nào ảnh hưởng trực tiếp tới kết quả học tập?", "Phát biểu nào sau đây là đúng theo nội dung PDF?"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Công cụ AI").font(.largeTitle.bold()).foregroundStyle(Color.examioInk)
                Text("Upload PDF, chọn dạng câu hỏi và tạo bộ đề trong vài giây.").foregroundStyle(.secondary)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 105), spacing: 8)], spacing: 8) {
                    ForEach(types, id: \.self) { type in
                        Button(type) {
                            if selectedTypes.contains(type) { selectedTypes.remove(type) } else { selectedTypes.insert(type) }
                        }
                        .font(.subheadline.weight(.semibold))
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .background(selectedTypes.contains(type) ? Color.examioPrimary.opacity(0.18) : Color.examioCard, in: Capsule())
                        .foregroundStyle(selectedTypes.contains(type) ? Color.examioPrimary : Color.examioInk)
                    }
                }

                VStack(spacing: 10) {
                    Image(systemName: "doc.badge.arrow.up").font(.largeTitle).foregroundStyle(Color.examioPrimary)
                    Text("Nhấn để chọn file PDF").font(.headline)
                    Text("Hỗ trợ PDF tối đa 10MB").font(.subheadline).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(28)
                .background(Color.examioCard, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.examioPrimary.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [7, 6])))

                HStack(spacing: 12) {
                    TextField("Số lượng", text: $count).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                    TextField("Từ khóa", text: $keywords).textFieldStyle(.roundedBorder)
                }

                Button("Bắt đầu") { generated = true }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.examioPrimary, in: RoundedRectangle(cornerRadius: 16))
                    .foregroundStyle(.white)

                if generated {
                    Text("Preview: \(count.isEmpty ? "5" : count) câu hỏi đã tạo").font(.headline)
                    ForEach(questions, id: \.self) { question in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Trắc nghiệm").font(.caption.bold()).foregroundStyle(Color.examioPrimary)
                            Text(question).foregroundStyle(Color.examioInk)
                            Text("Đáp án đúng: B").font(.footnote).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(Color.examioCard, in: RoundedRectangle(cornerRadius: 18))
                    }
                }
            }
            .padding(20)
        }
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

struct LichSuView: View {
    private let items = ["Tạo đề từ PDF Sinh học", "Hoàn thành bài thi Toán", "Ôn 20 flashcard tiếng Anh"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Lịch sử").font(.largeTitle.bold()).foregroundStyle(Color.examioInk)
                Text("Theo dõi hoạt động học tập, tài liệu và kết quả gần đây.").foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    HistoryStat(value: "18", label: "PDF")
                    HistoryStat(value: "42", label: "Bài thi")
                }
                HStack(spacing: 10) {
                    HistoryStat(value: "126", label: "Flashcards")
                    HistoryStat(value: "31h", label: "Tự học")
                }
                Text("Hoạt động gần đây").font(.headline).foregroundStyle(Color.examioInk)
                ForEach(items, id: \.self) { item in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item).font(.headline).foregroundStyle(Color.examioInk)
                        Text("Vừa cập nhật • Đồng bộ với Examio").font(.subheadline).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color.examioCard, in: RoundedRectangle(cornerRadius: 18))
                }
            }
            .padding(20)
        }
        .background(Color.examioCanvas)
    }
}

private struct HistoryStat: View {
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

struct ProfileSheet: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Capsule().fill(.secondary.opacity(0.25)).frame(width: 48, height: 5).frame(maxWidth: .infinity)
            HStack(spacing: 14) {
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 54))
                    .foregroundStyle(Color.examioPrimary)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Tài khoản Examio").font(.title3.bold()).foregroundStyle(Color.examioInk)
                    Text("Hồ sơ, ví và bảo mật").foregroundStyle(.secondary)
                }
            }
            ProfileSheetRow(icon: "creditcard", title: "Ví của tôi", subtitle: "Số dư, gói học tập và giao dịch")
            ProfileSheetRow(icon: "lock", title: "Đổi mật khẩu", subtitle: "Cập nhật bảo mật tài khoản")
            ProfileSheetRow(icon: "rectangle.portrait.and.arrow.right", title: "Đăng xuất", subtitle: "Kết thúc phiên đăng nhập")
            Spacer(minLength: 12)
        }
        .padding(24)
        .background(Color.examioCanvas)
    }
}

private struct ProfileSheetRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundStyle(Color.examioPrimary).frame(width: 28)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline).foregroundStyle(Color.examioInk)
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding()
        .background(Color.examioCard, in: RoundedRectangle(cornerRadius: 18))
    }
}
