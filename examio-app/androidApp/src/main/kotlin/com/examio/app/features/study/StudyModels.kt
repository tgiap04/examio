package com.examio.app.features.study

// All UI state lives in ViewModels — no mock data here.
// StudyFlashcard is kept for the in-screen study flow (flip/navigate cards).
data class StudyFlashcard(
    val id: String,
    val question: String,
    val answer: String,
)
