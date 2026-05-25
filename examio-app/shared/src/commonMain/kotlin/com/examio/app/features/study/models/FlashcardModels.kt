package com.examio.app.features.study.models

import kotlinx.serialization.Serializable

@Serializable
data class FlashcardSetLabel(
    val id: String,
    val name: String,
    val color: String? = null,
)

@Serializable
data class Flashcard(
    val id: String,
    val question: String,
    val answer: String,
    val image: String? = null,
    val flashcardSetId: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class FlashcardSet(
    val id: String,
    val title: String,
    val description: String? = null,
    val thumbnail: String? = null,
    val flashcardCount: Int = 0,
    val viewCount: Int = 0,
    val isPublic: Boolean = false,
    val isPinned: Boolean = false,
    val labels: List<FlashcardSetLabel> = emptyList(),
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class CreateFlashcardSetRequest(
    val title: String,
    val description: String? = null,
    val isPublic: Boolean = false,
)
