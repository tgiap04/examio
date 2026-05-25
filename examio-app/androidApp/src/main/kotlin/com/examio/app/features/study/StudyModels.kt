package com.examio.app.features.study

data class StudyMaterial(
    val id: String,
    val title: String,
    val description: String,
    val cardCount: Int,
    val lastViewed: String,
    val isPinned: Boolean,
)

data class StudyFlashcard(
    val question: String,
    val answer: String,
)

data class StudyUiState(
    val materials: List<StudyMaterial> = listOf(
        StudyMaterial(
            id = "foundation",
            title = "Nền tảng ôn tập",
            description = "Bộ thẻ mẫu mô phỏng danh sách học liệu từ web app.",
            cardCount = 3,
            lastViewed = "Hôm nay",
            isPinned = true,
        ),
        StudyMaterial(
            id = "strategy",
            title = "Chiến lược làm bài",
            description = "Các lưu ý ngắn để luyện tốc độ và độ chính xác.",
            cardCount = 2,
            lastViewed = "2 ngày trước",
            isPinned = false,
        ),
    ),
    val selectedMaterialId: String? = null,
    val currentCardIndex: Int = 0,
    val isAnswerVisible: Boolean = false,
    val flashcards: List<StudyFlashcard> = listOf(
        StudyFlashcard("Examio dùng tab Học tập để làm gì?", "Theo dõi học liệu, mở flashcard và tiếp tục luyện tập."),
        StudyFlashcard("Khi nối API thật cần lưu ý gì?", "Danh sách dài phải phân trang, refresh rõ ràng và không tải dư dữ liệu."),
        StudyFlashcard("Thiết kế mobile cần giữ cảm giác nào?", "Ấm, editorial, card bo tròn và màu coral tiết chế."),
    ),
) {
    val selectedMaterial: StudyMaterial?
        get() = materials.firstOrNull { it.id == selectedMaterialId }

    val currentCard: StudyFlashcard?
        get() = flashcards.getOrNull(currentCardIndex.coerceIn(0, (flashcards.size - 1).coerceAtLeast(0)))
}
