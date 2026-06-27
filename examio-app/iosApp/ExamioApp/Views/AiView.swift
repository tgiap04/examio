import SwiftUI
import UniformTypeIdentifiers

struct AiView: View {
    @StateObject private var vm = AIToolViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("AI")
                .font(.system(size: 34, weight: .regular, design: .serif))
                .foregroundStyle(Color.examioInk)

            Picker("", selection: $vm.selectedSection) {
                ForEach(AiSection.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)

            switch vm.selectedSection {
            case .teacher: AIChatSectionView(vm: vm)
            case .tool:    AIGeneratorSectionView(vm: vm)
            case .history: AIHistorySectionView(vm: vm)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.examioCanvas)
    }
}

// MARK: - Chat

private struct AIChatSectionView: View {
    @ObservedObject var vm: AIToolViewModel

    var body: some View {
        VStack(spacing: 12) {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 10) {
                        ForEach(vm.messages) { msg in
                            ChatBubble(message: msg).id(msg.id)
                        }
                    }
                }
                .onChange(of: vm.messages.count) { _ in
                    if let last = vm.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }

            if let err = vm.chatError {
                Text(err).font(.caption).foregroundStyle(.red)
            }

            TextField("Nhập câu hỏi cho giáo viên AI", text: $vm.input, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .disabled(vm.isSending)

            Button(action: vm.sendMessage) {
                if vm.isSending {
                    HStack { ProgressView(); Text("Đang gửi…") }
                } else {
                    Text("Gửi").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.examioPrimary)
            .disabled(vm.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.isSending)
        }
    }
}

private struct ChatBubble: View {
    let message: AIChatMessageItem
    var body: some View {
        HStack {
            if message.isUser { Spacer(minLength: 44) }
            Text(message.text)
                .font(.body).foregroundStyle(Color.examioInk)
                .padding(14)
                .background(message.isUser ? Color.examioPrimary.opacity(0.16) : Color.examioCard)
                .clipShape(RoundedRectangle(cornerRadius: 18))
            if !message.isUser { Spacer(minLength: 44) }
        }
    }
}

// MARK: - Generator

private struct AIGeneratorSectionView: View {
    @ObservedObject var vm: AIToolViewModel
    @State private var showFilePicker = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Tạo học liệu từ PDF")
                .font(.title3.weight(.medium)).foregroundStyle(Color.examioInk)

            HStack(spacing: 8) {
                ForEach([(1, "Quiz"), (2, "Flashcard")], id: \.0) { type, label in
                    Button(label) { vm.typeResult = type }
                        .buttonStyle(.bordered)
                        .tint(vm.typeResult == type ? .examioPrimary : .secondary)
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
                    if ["PENDING", "RUNNING"].contains(status.status) {
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

            Spacer()
        }
    }

    private func jobStatusLabel(_ s: JobStatusResponse) -> String {
        switch s.status {
        case "PENDING": return "Đang chờ xử lý…"
        case "RUNNING": return "Đang tạo… \(s.progress.map { "\($0)%" } ?? "")"
        case "DONE":    return "Tạo xong!"
        case "FAILED":  return "Thất bại: \(s.error ?? "lỗi không xác định")"
        case "CANCELLED": return "Đã huỷ"
        default:        return s.status
        }
    }
}

// MARK: - History

private struct AIHistorySectionView: View {
    @ObservedObject var vm: AIToolViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Lịch sử tải lên")
                .font(.title3.weight(.medium)).foregroundStyle(Color.examioInk)

            if vm.uploadsLoading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if let err = vm.uploadsError {
                VStack(spacing: 8) {
                    Text(err).font(.caption).foregroundStyle(.red)
                    Button("Thử lại") { Task { await vm.loadUploads() } }.buttonStyle(.bordered)
                }
            } else if vm.uploads.isEmpty {
                Text("Chưa có file nào được tải lên.")
                    .foregroundStyle(.secondary).font(.body)
            } else {
                ForEach(vm.uploads) { upload in
                    UploadRow(upload: upload, onDelete: { vm.deleteUpload(id: upload.id) })
                }
            }

            Spacer()
        }
    }
}

private struct UploadRow: View {
    let upload: RecentUploadItem
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(upload.filename).font(.headline).foregroundStyle(Color.examioInk)
                Spacer()
                if let status = upload.processingStatus {
                    Text(status).font(.caption.weight(.medium)).foregroundStyle(Color.examioPrimary)
                }
            }
            let detail = buildDetail()
            if !detail.isEmpty {
                Text(detail).font(.footnote).foregroundStyle(.secondary)
            }
            Button("Xoá", action: onDelete)
                .font(.caption).foregroundStyle(.red)
        }
        .padding(16)
        .background(Color.examioCard)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func buildDetail() -> String {
        var parts: [String] = []
        if let q = upload.quizHistory { parts.append("\(q.quizCount) quiz") }
        if let f = upload.flashcardHistory { parts.append("\(f.flashcardCount) flashcard") }
        return parts.joined(separator: " · ")
    }
}
