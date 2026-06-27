import SwiftUI

struct MyExamsView: View {
    @StateObject private var vm = MyExamsViewModel()
    @State private var selectedAttempt: RecentExamAttemptItem?

    var body: some View {
        Group {
            if let attempt = selectedAttempt {
                ExamAttemptDetailView(attempt: attempt, onBack: { selectedAttempt = nil })
            } else {
                MyExamsListView(vm: vm, onOpen: { selectedAttempt = $0 })
            }
        }
        .background(Color.examioCanvas)
    }
}

// MARK: - List

private struct MyExamsListView: View {
    @ObservedObject var vm: MyExamsViewModel
    let onOpen: (RecentExamAttemptItem) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Thi của tôi")
                        .font(.system(size: 34, weight: .regular, design: .serif))
                        .foregroundStyle(Color.examioInk)
                    Text("Quản lý phòng thi, tiếp tục lượt làm bài và xem kết quả gần đây.")
                        .foregroundStyle(.secondary)
                }

                if vm.isLoading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if let err = vm.errorMessage {
                    VStack(spacing: 8) {
                        Text(err).font(.caption).foregroundStyle(.red)
                        Button("Thử lại") { Task { await vm.load() } }.buttonStyle(.bordered)
                    }
                } else {
                    ForEach(vm.attempts) { attempt in
                        ExamAttemptRow(attempt: attempt, onOpen: { onOpen(attempt) }, onTogglePin: { vm.togglePin(examRoomId: attempt.examSession.examRoom.id) })
                    }
                }
            }
            .padding(24)
        }
    }
}

private struct ExamAttemptRow: View {
    let attempt: RecentExamAttemptItem
    let onOpen: () -> Void
    let onTogglePin: () -> Void

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(examStatusLabel(attempt.status))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Color.examioPrimary)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Color.examioPrimary.opacity(0.14))
                        .clipShape(Capsule())
                    Spacer()
                    Button(attempt.isPinned ? "Đã ghim" : "Ghim", action: onTogglePin)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Color.examioPrimary)
                }
                Text(attempt.examSession.examRoom.title)
                    .font(.headline).foregroundStyle(Color.examioInk)
                if let desc = attempt.examSession.examRoom.description {
                    Text(desc).font(.footnote).foregroundStyle(.secondary)
                }
                HStack(spacing: 12) {
                    Text("\(attempt.totalQuestions) câu")
                    if let limit = attempt.examSession.timeLimitMinutes { Text("\(limit) phút") }
                    Text("\(attempt.correctAnswers)/\(attempt.totalQuestions) đúng")
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            .padding(16)
            .background(Color.examioCard)
            .clipShape(RoundedRectangle(cornerRadius: 18))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Detail

private struct ExamAttemptDetailView: View {
    let attempt: RecentExamAttemptItem
    let onBack: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Button("← Danh sách", action: onBack).foregroundStyle(Color.examioPrimary)

            Text(attempt.examSession.examRoom.title)
                .font(.system(size: 30, weight: .regular, design: .serif))
                .foregroundStyle(Color.examioInk)

            if let desc = attempt.examSession.examRoom.description {
                Text(desc).foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("\(attempt.totalQuestions) câu hỏi")
                if let limit = attempt.examSession.timeLimitMinutes { Text("Thời lượng \(limit) phút") }
                Text("Kết quả: \(attempt.correctAnswers)/\(attempt.totalQuestions) đúng · \(String(format: "%.1f", attempt.score)) điểm")
                Text("Trạng thái: \(examStatusLabel(attempt.status))")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color.examioCard)
            .clipShape(RoundedRectangle(cornerRadius: 18))

            Text("Làm lại và nộp bài trực tiếp từ web app tại examio.vn để xem chi tiết đáp án.")
                .font(.footnote).foregroundStyle(.secondary)

            Button("Về danh sách", action: onBack)
                .buttonStyle(.borderedProminent).tint(.examioPrimary)
                .frame(maxWidth: .infinity)

            Spacer()
        }
        .padding(24)
    }
}

// MARK: - Helpers

private func examStatusLabel(_ status: Int) -> String {
    switch status {
    case 0: return "Đang làm"
    case 1: return "Hoàn thành"
    case 2: return "Hết giờ"
    default: return "Không rõ"
    }
}
