import SwiftUI

struct AccountView: View {
    @State private var state = AccountUiState()

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("Tài khoản")
                    .font(.system(size: 34, weight: .regular, design: .serif))
                    .foregroundStyle(Color.examioInk)
                Picker("Tài khoản", selection: $state.selectedSection) {
                    ForEach(AccountSection.allCases, id: \.self) { section in
                        Text(section.label).tag(section)
                    }
                }
                .pickerStyle(.segmented)

                switch state.selectedSection {
                case .profile:
                    profileView
                case .wallet:
                    walletView
                case .teacher:
                    teacherEntryView
                case .settings:
                    settingsView
                }
                Spacer()
            }
            .padding(24)
            .background(Color.examioCanvas)
            .navigationTitle("Tài khoản")
        }
    }

    private var profileView: some View {
        VStack(spacing: 14) {
            VStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 18)
                    .fill(Color.examioPrimary.opacity(0.14))
                    .frame(height: 72)
                Text(String(state.displayName.prefix(1)))
                    .font(.title.weight(.medium))
                    .foregroundStyle(Color.examioPrimary)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 16)
                    .background(Color.examioPrimary.opacity(0.18))
                    .clipShape(Circle())
                Text(state.displayName)
                    .font(.title3.weight(.medium))
                    .foregroundStyle(Color.examioInk)
                Text("@\(state.username) · \(state.email)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text(state.bio)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Chỉnh sửa hồ sơ") {}
                    .buttonStyle(.bordered)
            }
            .padding(18)
            .frame(maxWidth: .infinity)
            .background(Color.examioCard)
            .clipShape(RoundedRectangle(cornerRadius: 22))
        }
    }

    private var walletView: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Số dư ví")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Color.examioPrimary)
                Text(state.balance)
                    .font(.system(size: 30, weight: .regular, design: .serif))
                    .foregroundStyle(Color.examioInk)
                Text("Gói hiện tại: \(state.subscription)")
                    .foregroundStyle(.secondary)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.examioPrimary.opacity(0.16))
            .clipShape(RoundedRectangle(cornerRadius: 22))

            Text("Giao dịch gần đây")
                .font(.headline)
                .foregroundStyle(Color.examioInk)
            ForEach(state.transactions) { transaction in
                TransactionRow(transaction: transaction)
            }
            Button("Nâng cấp gói") {}
                .buttonStyle(.borderedProminent)
                .tint(.examioPrimary)
        }
    }

    private var teacherEntryView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Giảng dạy")
                .font(.headline)
                .foregroundStyle(Color.examioInk)
            Text("Lối vào nhanh cho nội dung teacher sẽ được mở khi role Teacher được cấp.")
                .foregroundStyle(.secondary)
            Button("Quản lý nội dung") {}
                .buttonStyle(.borderedProminent)
                .tint(.examioPrimary)
        }
    }
    private var settingsView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Bảo mật")
                .font(.headline)
                .foregroundStyle(Color.examioInk)
            Button("Đổi mật khẩu") {}
                .buttonStyle(.bordered)
            Button("Đăng xuất") {}
                .buttonStyle(.bordered)
            Text("Token sẽ được lưu bằng Keychain, không dùng UserDefaults.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

private enum AccountSection: CaseIterable {
    case profile
    case wallet
    case teacher
    case settings

    var label: String {
        switch self {
        case .profile: "Hồ sơ"
        case .wallet: "Ví"
        case .teacher: "Giảng dạy"
        case .settings: "Cài đặt"
        }
    }
}

private struct AccountUiState {
    var selectedSection: AccountSection = .profile
    let displayName = "Người học Examio"
    let username = "examio.student"
    let email = "student@example.com"
    let bio = "Đang xây dựng thói quen ôn luyện mỗi ngày."
    let balance = "125.000đ"
    let subscription = "Free"
    let transactions: [AccountTransaction] = [
        .init(title: "Nạp ví", amount: "+100.000đ", date: "Hôm nay", isPositive: true),
        .init(title: "Tạo đề từ PDF", amount: "-12.000đ", date: "Hôm qua", isPositive: false),
    ]
}

private struct AccountTransaction: Identifiable {
    let id = UUID()
    let title: String
    let amount: String
    let date: String
    let isPositive: Bool
}

private struct TransactionRow: View {
    let transaction: AccountTransaction

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(transaction.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.examioInk)
                Text(transaction.date)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(transaction.amount)
                .foregroundStyle(transaction.isPositive ? Color.examioPrimary : .red)
        }
        .padding(16)
        .background(Color.examioCard)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
