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
