package com.examio.app.features.study.models

import kotlinx.serialization.Serializable

@Serializable
data class FlashcardStudyState(
    val setId: String,
    val currentIndex: Int = 0,
    val isAnswerVisible: Boolean = false,
    val masteredCardIds: Set<String> = emptySet(),
)
