package com.examio.app.features.study.models

import kotlinx.serialization.Serializable

@Serializable
data class FlashcardSetLabel(
    val id: String,
    val name: String,
    val color: String? = null,
    val description: String? = null,
    val order: Int = 0,
    val questionCount: Int = 0,
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
data class FlashcardSetCreator(
    val id: String,
    val username: String,
    val name: String? = null,
    val avatar: String? = null,
)

@Serializable
data class RecentFlashcardSet(
    val id: String,
    val title: String,
    val description: String? = null,
    val thumbnail: String? = null,
    val viewCount: Int = 0,
    val flashcardCount: Int = 0,
    val lastViewedAt: String? = null,
    val createdAt: String,
    val creator: FlashcardSetCreator? = null,
    val isPublic: Boolean = false,
    val isPinned: Boolean = false,
    val progress: Float? = null,
)

@Serializable
data class RecentFlashcardsResponse(
    val flashcardSets: List<RecentFlashcardSet>,
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val totalPages: Int = 1,
)

@Serializable
data class FlashcardSetListResponse(
    val flashcardSets: List<FlashcardSet>,
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val totalPages: Int = 1,
)

@Serializable
data class FlashcardPagination(
    val page: Int,
    val limit: Int,
    val total: Int,
    val totalPages: Int,
)

@Serializable
data class FlashcardCardsResponse(
    val flashCards: List<Flashcard>,
    val pagination: FlashcardPagination? = null,
)

@Serializable
data class CreateFlashcardSetRequest(
    val title: String,
    val description: String? = null,
    val isPublic: Boolean = false,
)

@Serializable
data class CreateFlashcardRequest(
    val question: String,
    val answer: String,
)

@Serializable
data class UpdateFlashcardRequest(
    val question: String? = null,
    val answer: String? = null,
)

@Serializable
data class PinResponse(
    val pinned: Boolean,
)

@Serializable
data class LabelsResponse(
    val labels: List<FlashcardSetLabel>,
    val unlabeledCount: Int = 0,
)

@Serializable
data class CreateLabelRequest(
    val name: String,
    val description: String? = null,
    val color: String? = null,
    val order: Int? = null,
)

@Serializable
data class UpdateLabelRequest(
    val name: String? = null,
    val description: String? = null,
    val color: String? = null,
    val order: Int? = null,
)

@Serializable
data class LabelResponse(
    val message: String? = null,
    val label: FlashcardSetLabel,
)
