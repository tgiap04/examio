package com.examio.app.features.study.repository

import com.examio.app.features.study.api.FlashcardApiService
import com.examio.app.features.study.api.StudentMaterialsApiService
import com.examio.app.features.study.models.CreateFlashcardSetRequest

class FlashcardRepository(
    private val flashcards: FlashcardApiService,
    private val materials: StudentMaterialsApiService,
) {
    suspend fun list(page: Int = 1, limit: Int = 20, search: String? = null) = flashcards.list(page, limit, search)
    suspend fun get(id: String) = flashcards.get(id)
    suspend fun create(request: CreateFlashcardSetRequest) = flashcards.create(request)
    suspend fun update(id: String, request: CreateFlashcardSetRequest) = flashcards.update(id, request)
    suspend fun delete(id: String) = flashcards.delete(id)
    suspend fun cards(setId: String) = flashcards.flashcards(setId)
    suspend fun recent(page: Int = 1, limit: Int = 20) = materials.recentFlashcards(page, limit)
    suspend fun togglePin(id: String) = materials.toggleFlashcardPin(id)
}
