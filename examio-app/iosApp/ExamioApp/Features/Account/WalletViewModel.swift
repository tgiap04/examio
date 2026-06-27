import Foundation

struct WalletTransaction: Decodable, Identifiable {
    let id: String
    let amount: Double
    let type: Int
    let typeLabel: String?
    let direction: String?
    let description: String?
    let createdAt: String?
}

struct TransactionPagination: Decodable {
    let data: [WalletTransaction]
    let total: Int
    let page: Int
    let size: Int
    let totalPages: Int
}

struct WalletDetails: Decodable {
    let id: String
    let balance: Double
    let totalPurchased: Double
    let totalUsed: Double
    let transactions: TransactionPagination
}

struct SubscriptionPlan: Decodable {
    let tier: Int
    let name: String
    let nameVi: String?
    let creditsPerMonth: Int
    let priceMonthly: Double
    let priceYearly: Double
}

@MainActor
final class WalletViewModel: ObservableObject {
    @Published var wallet: WalletDetails?
    @Published var plans: [SubscriptionPlan] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let api = ExamioAPIClient.shared

    init() { Task { await load() } }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            async let walletResult: WalletDetails = api.get("/wallet/details", query: ["page": "1", "size": "10"])
            async let plansResult: [SubscriptionPlan] = api.get("/payment/subscription/plans")
            wallet = try await walletResult
            plans = (try? await plansResult) ?? []
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
