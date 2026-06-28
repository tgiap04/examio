package com.examio.app.features.study

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.study.models.CreateFlashcardRequest
import com.examio.app.features.study.models.Flashcard
import com.examio.app.features.study.models.UpdateFlashcardRequest
import com.examio.app.features.study.repository.FlashcardRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class FlashcardManageState(
    val isLoading: Boolean = false,
    val setTitle: String = "",
    val cards: List<Flashcard> = emptyList(),
    val error: String? = null,
    val editing: Flashcard? = null, // null + showEditSheet => adding new
    val showEditSheet: Boolean = false,
    val isSaving: Boolean = false,
    val deletingId: String? = null,
)

class FlashcardManageViewModel(
    private val setId: String,
    private val setTitle: String,
    private val repo: FlashcardRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(FlashcardManageState(setTitle = setTitle))
    val state: StateFlow<FlashcardManageState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            when (val res = repo.cards(setId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isLoading = false, cards = res.data.flashCards)
                is ApiResult.HttpError -> _state.value = _state.value.copy(isLoading = false, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoading = false, error = res.message)
            }
        }
    }

    fun showAdd() { _state.value = _state.value.copy(editing = null, showEditSheet = true) }
    fun showEdit(card: Flashcard) { _state.value = _state.value.copy(editing = card, showEditSheet = true) }
    fun dismissSheet() { _state.value = _state.value.copy(showEditSheet = false, editing = null) }

    fun save(question: String, answer: String) {
        val editing = _state.value.editing
        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, error = null)
            val res = if (editing == null) {
                repo.addCard(setId, CreateFlashcardRequest(question = question, answer = answer))
            } else {
                repo.updateCard(setId, editing.id, UpdateFlashcardRequest(question = question, answer = answer))
            }
            when (res) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(isSaving = false, showEditSheet = false, editing = null)
                    load()
                }
                is ApiResult.HttpError -> _state.value = _state.value.copy(isSaving = false, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isSaving = false, error = res.message)
            }
        }
    }

    fun delete(cardId: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(deletingId = cardId)
            when (val res = repo.deleteCard(setId, cardId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    deletingId = null,
                    cards = _state.value.cards.filterNot { it.id == cardId },
                )
                is ApiResult.HttpError -> _state.value = _state.value.copy(deletingId = null, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(deletingId = null, error = res.message)
            }
        }
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
