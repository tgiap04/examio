import SwiftUI
import UniformTypeIdentifiers

struct AiView: View {
    @StateObject private var vm = AIToolViewModel()
    @State private var didInit = false
    @State private var showFilePicker = false
    @State private var newSetTitle = ""

    // When presented from a contextual entry (Study/DeThi), preset the type.
    var initialTypeResult: Int? = nil
    var onClose: (() -> Void)? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let onClose {
                    Button(action: onClose) {
                        Label("Quay lại", systemImage: "chevron.left")
                    }
                    .tint(.examioPrimary)
                }

                Text("Tạo học liệu từ PDF")
                    .font(.system(size: 28, weight: .regular, design: .serif))
                    .foregroundStyle(Color.examioInk)

                // Lock type once generation starts / a result exists — the saved domain
                // must stay tied to what was actually generated (result.type).
                let typeLocked = vm.isGenerating || vm.generatedResult != nil
                HStack(spacing: 8) {
                    ForEach([(1, "Quiz"), (2, "Flashcard")], id: \.0) { type, label in
                        Button(label) { vm.typeResult = type }
                            .buttonStyle(.bordered)
                            .tint(vm.typeResult == type ? .examioPrimary : .secondary)
                            .disabled(typeLocked)
                    }
                }

                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Số lượng").font(.caption).foregroundStyle(.secondary)
                        TextField("5", value: $vm.quantity, format: .number)
                            .textFieldStyle(.roundedBorder)
                            .keyboardType(.numberPad)
                            .frame(width: 72)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Từ khóa").font(.caption).foregroundStyle(.secondary)
                        TextField("Tuỳ chọn", text: $vm.keyword)
                            .textFieldStyle(.roundedBorder)
                    }
                }

                Button(action: { showFilePicker = true }) {
                    Label(vm.selectedFileName ?? "Chọn file PDF", systemImage: "doc.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [UTType.pdf]) { result in
                    if case .success(let url) = result, url.startAccessingSecurityScopedResource() {
                        defer { url.stopAccessingSecurityScopedResource() }
                        if let data = try? Data(contentsOf: url) {
                            vm.onFileSelected(data: data, filename: url.lastPathComponent)
                        }
                    }
                }

                if let err = vm.generateError {
                    Text(err).font(.caption).foregroundStyle(.red)
                }

                if let status = vm.jobStatus {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(jobStatusLabel(status)).font(.caption).foregroundStyle(.secondary)
                        if ["pending", "processing"].contains(status.status.lowercased()) {
                            ProgressView(value: Double(status.progress ?? 0), total: 100)
                        }
                    }
                }

                Button(action: vm.generate) {
                    if vm.isGenerating {
                        HStack { ProgressView(); Text("Đang tạo…") }
                    } else {
                        Text("Tạo học liệu").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(.examioPrimary)
                .disabled(vm.selectedFileName == nil || vm.isGenerating)

                if let result = vm.generatedResult {
                    GeneratedResultView(vm: vm, result: result, newSetTitle: $newSetTitle)
                }
            }
            .padding(24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.examioCanvas)
        .onAppear {
            guard !didInit else { return }
            didInit = true
            if let t = initialTypeResult { vm.typeResult = t }
        }
    }

    private func jobStatusLabel(_ s: JobStatusResponse) -> String {
        switch s.status.lowercased() {
        case "pending":    return "Đang chờ xử lý…"
        case "processing": return "Đang tạo… \(s.progress.map { "\($0)%" } ?? "")"
        case "completed":  return "Tạo xong!"
        case "failed":     return "Thất bại: \(s.error ?? "lỗi không xác định")"
        case "cancelled":  return "Đã huỷ"
        default:           return s.status
        }
    }
}

// MARK: - Generated result preview + save-to-set

private struct GeneratedResultView: View {
    @ObservedObject var vm: AIToolViewModel
    let result: JobResult
    @Binding var newSetTitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            let count = result.quizzes?.count ?? result.flashcards?.count ?? 0
            Text("Kết quả (\(count))").font(.headline).foregroundStyle(Color.examioInk)

            ForEach((result.quizzes ?? []).prefix(5).map { $0 }) { q in
                VStack(alignment: .leading, spacing: 4) {
                    Text(q.question).font(.body).foregroundStyle(Color.examioInk)
                    ForEach(Array(q.options.enumerated()), id: \.offset) { _, opt in
                        Text((opt == q.answer ? "✓ " : "• ") + opt)
                            .font(.caption)
                            .foregroundStyle(opt == q.answer ? Color.examioPrimary : .secondary)
                    }
                }
                .padding(12).examioCard(cornerRadius: 14)
            }
            ForEach((result.flashcards ?? []).prefix(5).map { $0 }) { c in
                VStack(alignment: .leading, spacing: 4) {
                    Text(c.question).font(.body).foregroundStyle(Color.examioInk)
                    Text(c.answer).font(.caption).foregroundStyle(.secondary)
                }
                .padding(12).examioCard(cornerRadius: 14)
            }
            if count > 5 {
                Text("… và \(count - 5) mục khác").font(.caption).foregroundStyle(.secondary)
            }

            if let saved = vm.savedCount {
                Text("Đã lưu \(saved) mục vào bộ.").font(.body).foregroundStyle(Color.examioPrimary)
            } else {
                Text("Lưu vào bộ").font(.subheadline.weight(.medium)).foregroundStyle(.secondary)

                TextField("Tên bộ mới", text: $newSetTitle)
                    .textFieldStyle(.roundedBorder)
                    .disabled(vm.isSaving)
                Button(action: { vm.saveToNewSet(title: newSetTitle) }) {
                    if vm.isSaving { HStack { ProgressView(); Text("Đang lưu…") } }
                    else { Text("Tạo bộ mới & lưu").frame(maxWidth: .infinity) }
                }
                .buttonStyle(.borderedProminent).tint(.examioPrimary)
                .disabled(newSetTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.isSaving)

                let existing: [(String, String)] = result.type == "quiz"
                    ? vm.quizSets.map { ($0.id, $0.title) }
                    : vm.flashcardSets.map { ($0.id, $0.title) }
                if !existing.isEmpty {
                    Text("Hoặc chọn bộ có sẵn:").font(.caption).foregroundStyle(.secondary)
                    ForEach(existing.prefix(20).map { $0 }, id: \.0) { id, title in
                        Button(title) { vm.saveToExistingSet(id: id) }
                            .buttonStyle(.bordered)
                            .frame(maxWidth: .infinity)
                            .disabled(vm.isSaving)
                    }
                }
            }

            if let err = vm.saveError {
                Text(err).font(.caption).foregroundStyle(.red)
            }
        }
    }
}
