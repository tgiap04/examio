import SwiftUI

struct AccountView: View {
    @StateObject private var profileVM = ProfileViewModel()
    @StateObject private var walletVM = WalletViewModel()
    @State private var selectedSection: AccountSection = .profile
    var onDismiss: (() -> Void)? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Tài khoản")
                    .font(.system(size: 34, weight: .regular, design: .serif))
                    .foregroundStyle(Color.examioInk)

                Picker("Tài khoản", selection: $selectedSection) {
                    ForEach(AccountSection.allCases, id: \.self) { section in
                        Text(section.label).tag(section)
                    }
                }
                .pickerStyle(.segmented)

                switch selectedSection {
                case .profile: profileView
                case .wallet: walletView
                case .teacher: teacherEntryView
                case .settings: settingsView
                }

                Spacer(minLength: 24)
            }
            .padding(24)
        }
        .background(Color.examioCanvas)
    }

    // MARK: Profile

    private var profileView: some View {
        Group {
            if profileVM.isLoading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else {
                profileCard
            }
        }
    }

    private var profileCard: some View {
        VStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 18)
                .fill(Color.examioPrimary.opacity(0.14))
                .frame(height: 72)
            let initial = profileVM.profile?.name?.first.map(String.init)
                ?? profileVM.profile?.username?.first.map(String.init)
                ?? "?"
            Text(initial)
                .font(.title.weight(.medium))
                .foregroundStyle(Color.examioPrimary)
                .padding(.horizontal, 22)
                .padding(.vertical, 16)
                .background(Color.examioPrimary.opacity(0.18))
                .clipShape(Circle())
            Text(profileVM.profile?.name ?? profileVM.profile?.username ?? "—")
                .font(.title3.weight(.medium))
                .foregroundStyle(Color.examioInk)
            Text("@\(profileVM.profile?.username ?? "—") · \(profileVM.profile?.email ?? "")")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let bio = profileVM.profile?.bio, !bio.isEmpty {
                Text(bio)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            if let err = profileVM.errorMessage {
                Text(err).font(.caption).foregroundStyle(.red)
            }
            Button("Chỉnh sửa hồ sơ") {}
                .buttonStyle(.bordered)
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .examioCard(cornerRadius: 22)
    }

    // MARK: Wallet

    private var walletView: some View {
        Group {
            if walletVM.isLoading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if let err = walletVM.errorMessage {
                VStack(spacing: 8) {
                    Text(err).font(.caption).foregroundStyle(.red)
                    Button("Thử lại") { Task { await walletVM.load() } }
                        .buttonStyle(.bordered)
                }
            } else {
                walletContent
            }
        }
    }

    private var walletContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Số dư ví")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Color.examioPrimary)
                Text("\(Int(walletVM.wallet?.balance ?? 0))đ")
                    .font(.system(size: 30, weight: .regular, design: .serif))
                    .foregroundStyle(Color.examioInk)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.examioPrimary.opacity(0.16))
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(Color.examioHairline, lineWidth: 1)
            )

            let txs = walletVM.wallet?.transactions.data ?? []
            if !txs.isEmpty {
                Text("Giao dịch gần đây")
                    .font(.headline)
                    .foregroundStyle(Color.examioInk)
                ForEach(txs.prefix(5)) { tx in WalletTransactionRow(transaction: tx) }
            }

            Button("Nâng cấp gói") {}
                .buttonStyle(.borderedProminent)
                .tint(.examioPrimary)
                .frame(maxWidth: .infinity)
        }
    }

    // MARK: Teacher / Settings

    private var teacherEntryView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Giảng dạy").font(.headline).foregroundStyle(Color.examioInk)
            Text("Lối vào nhanh cho nội dung teacher sẽ được mở khi role Teacher được cấp.")
                .foregroundStyle(.secondary)
            Button("Quản lý nội dung") {}
                .buttonStyle(.borderedProminent)
                .tint(.examioPrimary)
        }
    }

    private var settingsView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Bảo mật").font(.headline).foregroundStyle(Color.examioInk)
            Button("Đổi mật khẩu") {}.buttonStyle(.bordered)
            Button("Đăng xuất") { onDismiss?() }.buttonStyle(.bordered)
            Text("Token được lưu bằng Keychain, không dùng UserDefaults.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Supporting

private enum AccountSection: String, CaseIterable {
    case profile, wallet, teacher, settings
    var label: String {
        switch self {
        case .profile: "Hồ sơ"
        case .wallet: "Ví"
        case .teacher: "Giảng dạy"
        case .settings: "Cài đặt"
        }
    }
}

private struct WalletTransactionRow: View {
    let transaction: WalletTransaction
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(transaction.typeLabel ?? transaction.description ?? "Giao dịch")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.examioInk)
                Text(transaction.createdAt ?? "")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            let isAdd = transaction.direction == "ADD"
            Text("\(isAdd ? "+" : "-")\(Int(transaction.amount))đ")
                .foregroundStyle(isAdd ? Color.examioPrimary : Color.examioError)
        }
        .padding(16)
        .examioCard(cornerRadius: 16)
    }
}
