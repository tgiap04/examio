package com.examio.app.features.account

enum class AccountSection(val label: String) {
    Profile("Hồ sơ"),
    Wallet("Ví"),
    Teacher("Giảng dạy"),
    Settings("Cài đặt"),
}

data class TransactionItem(
    val title: String,
    val amount: String,
    val date: String,
    val isPositive: Boolean,
)

data class AccountUiState(
    val selectedSection: AccountSection = AccountSection.Profile,
    val displayName: String = "Người học Examio",
    val username: String = "examio.student",
    val email: String = "student@example.com",
    val bio: String = "Đang xây dựng thói quen ôn luyện mỗi ngày.",
    val balance: String = "125.000đ",
    val subscription: String = "Free",
    val transactions: List<TransactionItem> = listOf(
        TransactionItem("Nạp ví", "+100.000đ", "Hôm nay", true),
        TransactionItem("Tạo đề từ PDF", "-12.000đ", "Hôm qua", false),
    ),
)
