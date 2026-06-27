package com.examio.app.features.navigation

enum class MainTab(
    val title: String,
    val description: String,
) {
    TaiLieu("Tài liệu", "Bộ flashcard và tài liệu học tập"),
    BaiThi("Bài thi", "Lượt làm bài và kết quả gần đây"),
    DeThi("Đề thi", "Quản lý bộ đề, flashcard và phòng thi"),
    LichSu("Lịch sử", "Hoạt động học tập và thống kê cá nhân"),
}
