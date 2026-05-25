package com.examio.app.features.home

data class HomeStat(
    val label: String,
    val value: String,
    val hint: String,
)

data class HomeRecentFlashcard(
    val title: String,
    val cardCount: Int,
)

data class HomeRecentExam(
    val title: String,
    val score: String,
    val date: String,
)

data class HomeDashboardState(
    val stats: List<HomeStat> = listOf(
        HomeStat("Tài liệu", "0", "PDF đã xử lý"),
        HomeStat("Bài thi", "0", "lượt đã làm"),
        HomeStat("Flashcard", "0", "bộ đang học"),
        HomeStat("Giờ học", "0", "trong tuần"),
    ),
    val recentFlashcards: List<HomeRecentFlashcard> = emptyList(),
    val recentExams: List<HomeRecentExam> = emptyList(),
)
