package com.examio.app.features.ai

enum class AiSection(val label: String) {
    Teacher("Giáo viên AI"),
    Tool("Tạo đề"),
    History("Lịch sử"),
}

data class AiChatMessage(
    val text: String,
    val isUser: Boolean,
)

data class AiHistoryItem(
    val title: String,
    val status: String,
    val detail: String,
)

data class AiUiState(
    val selectedSection: AiSection = AiSection.Teacher,
    val messages: List<AiChatMessage> = listOf(
        AiChatMessage("Em muốn ôn phần nào hôm nay?", isUser = false),
        AiChatMessage("Giúp em tạo lộ trình ôn thi ngắn.", isUser = true),
        AiChatMessage("Bắt đầu với mục tiêu, thời gian còn lại và bộ tài liệu em đã tải lên.", isUser = false),
    ),
    val input: String = "",
    val generatorType: String = "Flashcard + Quiz",
    val generatedCount: Int = 12,
    val history: List<AiHistoryItem> = listOf(
        AiHistoryItem("chuong-1.pdf", "Đã xử lý", "8 flashcard · 1 bộ quiz"),
        AiHistoryItem("Đề luyện tổng hợp", "Hoàn thành", "Điểm gần nhất 8.5"),
    ),
)
