package com.examio.app.features.study

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.study.models.CreateFlashcardSetRequest
import com.examio.app.features.study.models.RecentFlashcardSet
import com.examio.app.features.study.repository.FlashcardRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class MyMaterialsState(
    val isLoading: Boolean = false,
    val sets: List<RecentFlashcardSet> = emptyList(),
    val error: String? = null,
    /** Sheet target: null = closed, NEW_SET = creating, else = editing that set. */
    val editing: RecentFlashcardSet? = null,
    val isSheetOpen: Boolean = false,
    val isSaving: Boolean = false,
    /** Set queued for deletion confirmation. */
    val pendingDelete: RecentFlashcardSet? = null,
)

class MyMaterialsViewModel(private val repo: FlashcardRepository) : ViewModel() {
    private val _state = MutableStateFlow(MyMaterialsState())
    val state: StateFlow<MyMaterialsState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            when (val result = repo.recent()) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    isLoading = false,
                    sets = result.data.flashcardSets,
                )
                is ApiResult.HttpError -> _state.value = _state.value.copy(
                    isLoading = false,
                    error = result.message,
                )
                is ApiResult.NetworkError -> _state.value = _state.value.copy(
                    isLoading = false,
                    error = result.message,
                )
            }
        }
    }

    fun togglePin(id: String) {
        viewModelScope.launch {
            repo.togglePin(id)
            load()
        }
    }

    fun openCreate() { _state.value = _state.value.copy(isSheetOpen = true, editing = null) }
    fun openEdit(set: RecentFlashcardSet) { _state.value = _state.value.copy(isSheetOpen = true, editing = set) }
    fun dismissSheet() { _state.value = _state.value.copy(isSheetOpen = false, editing = null) }

    fun requestDelete(set: RecentFlashcardSet) { _state.value = _state.value.copy(pendingDelete = set) }
    fun dismissDelete() { _state.value = _state.value.copy(pendingDelete = null) }

    /** Create (editing == null) or rename (editing != null) a set, then refresh. */
    fun saveSet(title: String, description: String?) {
        val target = _state.value.editing
        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, error = null)
            val request = CreateFlashcardSetRequest(title = title, description = description?.ifBlank { null })
            val result = if (target == null) repo.create(request) else repo.update(target.id, request)
            when (result) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(isSaving = false, isSheetOpen = false, editing = null)
                    load()
                }
                is ApiResult.HttpError -> _state.value = _state.value.copy(isSaving = false, error = result.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isSaving = false, error = result.message)
            }
        }
    }

    fun confirmDelete() {
        val target = _state.value.pendingDelete ?: return
        // Clear synchronously so a rapid double-tap can't launch two delete calls.
        _state.value = _state.value.copy(pendingDelete = null, error = null)
        viewModelScope.launch {
            when (val result = repo.delete(target.id)) {
                is ApiResult.Success -> load()
                is ApiResult.HttpError -> _state.value = _state.value.copy(error = result.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(error = result.message)
            }
        }
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
