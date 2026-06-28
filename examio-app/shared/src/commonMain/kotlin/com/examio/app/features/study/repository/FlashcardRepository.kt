package com.examio.app.features.study.repository

import com.examio.app.features.study.api.FlashcardApiService
import com.examio.app.features.study.api.StudentMaterialsApiService
import com.examio.app.features.study.models.CreateFlashcardRequest
import com.examio.app.features.study.models.CreateFlashcardSetRequest
import com.examio.app.features.study.models.CreateLabelRequest
import com.examio.app.features.study.models.UpdateFlashcardRequest
import com.examio.app.features.study.models.UpdateLabelRequest

class FlashcardRepository(
    private val flashcards: FlashcardApiService,
    private val materials: StudentMaterialsApiService,
) {
    // Set CRUD
    suspend fun list(page: Int = 1, limit: Int = 20, search: String? = null) = flashcards.list(page, limit, search)
    suspend fun get(id: String) = flashcards.get(id)

    // Study access flow (use these to OPEN a set for studying — handles
    // owner/public/whitelist/code-required; get() is owner-only).
    suspend fun checkAccess(id: String) = flashcards.checkAccess(id)
    suspend fun studyDetail(id: String) = flashcards.studyDetail(id)
    suspend fun studyWithCode(id: String, accessCode: String) = flashcards.studyWithCode(id, accessCode)
    suspend fun create(request: CreateFlashcardSetRequest) = flashcards.create(request)
    suspend fun update(id: String, request: CreateFlashcardSetRequest) = flashcards.update(id, request)
    suspend fun delete(id: String) = flashcards.delete(id)

    // Flashcard CRUD
    suspend fun cards(setId: String, page: Int = 1, limit: Int = 100) = flashcards.flashcards(setId, page, limit)
    suspend fun addCard(setId: String, request: CreateFlashcardRequest) = flashcards.addFlashcard(setId, request)
    suspend fun updateCard(setId: String, cardId: String, request: UpdateFlashcardRequest) = flashcards.updateFlashcard(setId, cardId, request)
    suspend fun deleteCard(setId: String, cardId: String) = flashcards.deleteFlashcard(setId, cardId)

    // Labels
    suspend fun getLabels(setId: String) = flashcards.getLabels(setId)
    suspend fun createLabel(setId: String, request: CreateLabelRequest) = flashcards.createLabel(setId, request)
    suspend fun updateLabel(setId: String, labelId: String, request: UpdateLabelRequest) = flashcards.updateLabel(setId, labelId, request)
    suspend fun deleteLabel(setId: String, labelId: String) = flashcards.deleteLabel(setId, labelId)

    // Student materials
    suspend fun recent(page: Int = 1, limit: Int = 20) = materials.recentFlashcards(page, limit)
    suspend fun togglePin(id: String) = materials.toggleFlashcardPin(id)
}
