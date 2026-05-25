package com.examio.app.features.teacher

enum class TeacherContentType(val label: String) {
    Flashcards("Flashcard"),
    QuizSets("Quiz"),
    ExamRooms("Phòng thi"),
}

data class TeacherContentItem(
    val title: String,
    val description: String,
    val countLabel: String,
    val status: String,
)

data class TeacherUiState(
    val selectedType: TeacherContentType = TeacherContentType.Flashcards,
    val flashcardSets: List<TeacherContentItem> = listOf(
        TeacherContentItem("Từ vựng trọng tâm", "Bộ flashcard dùng cho lớp luyện đề.", "32 thẻ", "Công khai"),
        TeacherContentItem("Công thức nhanh", "Các công thức cần ghi nhớ trước kỳ thi.", "18 thẻ", "Riêng tư"),
    ),
    val quizSets: List<TeacherContentItem> = listOf(
        TeacherContentItem("Quiz chương 1", "Câu hỏi trắc nghiệm nền tảng.", "24 câu", "Đang dùng"),
        TeacherContentItem("Mini test cuối tuần", "Bộ đề kiểm tra ngắn.", "12 câu", "Nháp"),
    ),
    val examRooms: List<TeacherContentItem> = listOf(
        TeacherContentItem("Lớp 12A - Luyện đề", "Phòng thi có lịch mở theo tuần.", "3 phiên", "Hoạt động"),
        TeacherContentItem("Thi thử cuối khóa", "Phòng thi tổng hợp có giới hạn thời gian.", "1 phiên", "Sắp mở"),
    ),
) {
    val currentItems: List<TeacherContentItem>
        get() = when (selectedType) {
            TeacherContentType.Flashcards -> flashcardSets
            TeacherContentType.QuizSets -> quizSets
            TeacherContentType.ExamRooms -> examRooms
        }
}
