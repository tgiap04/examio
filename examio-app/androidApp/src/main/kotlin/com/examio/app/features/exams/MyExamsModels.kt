package com.examio.app.features.exams

enum class ExamStatus(val label: String) {
    InProgress("Đang làm"),
    Completed("Hoàn thành"),
    Upcoming("Sẵn sàng"),
}

data class ExamAttemptItem(
    val id: String,
    val title: String,
    val description: String,
    val status: ExamStatus,
    val score: String,
    val date: String,
    val questionCount: Int,
    val durationMinutes: Int,
    val isPinned: Boolean,
)

data class ExamQuestion(
    val prompt: String,
    val options: List<String>,
)

data class MyExamsUiState(
    val attempts: List<ExamAttemptItem> = listOf(
        ExamAttemptItem(
            id = "mock-entrance",
            title = "Đề luyện tổng hợp",
            description = "Phòng thi mô phỏng trải nghiệm Examio web với đồng hồ và lưu tiến độ.",
            status = ExamStatus.Upcoming,
            score = "--",
            date = "Hôm nay",
            questionCount = 3,
            durationMinutes = 45,
            isPinned = true,
        ),
        ExamAttemptItem(
            id = "mock-review",
            title = "Ôn tập chương 1",
            description = "Bài thi ngắn để kiểm tra kiến thức nền tảng.",
            status = ExamStatus.Completed,
            score = "8.5",
            date = "2 ngày trước",
            questionCount = 2,
            durationMinutes = 15,
            isPinned = false,
        ),
    ),
    val selectedAttemptId: String? = null,
    val isTakingQuiz: Boolean = false,
    val currentQuestionIndex: Int = 0,
    val answers: Map<Int, Int> = emptyMap(),
    val isResultVisible: Boolean = false,
    val questions: List<ExamQuestion> = listOf(
        ExamQuestion("Khi làm bài trên mobile, dữ liệu nào cần lưu định kỳ?", listOf("Màu theme", "Câu trả lời hiện tại", "Tên tab", "Font chữ")),
        ExamQuestion("Timer nên hiển thị ở đâu?", listOf("Cuối trang", "Trong lobby", "Nổi bật trên màn hình làm bài", "Ẩn đi")),
        ExamQuestion("Trước khi nộp bài nên có bước nào?", listOf("Xóa đáp án", "Xác nhận nộp", "Đăng xuất", "Đổi đề")),
    ),
) {
    val selectedAttempt: ExamAttemptItem?
        get() = attempts.firstOrNull { it.id == selectedAttemptId }

    val currentQuestion: ExamQuestion?
        get() = questions.getOrNull(currentQuestionIndex.coerceIn(0, (questions.size - 1).coerceAtLeast(0)))

    val answeredCount: Int
        get() = answers.keys.toSet().size
}
