package com.examio.app.features.study

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.study.models.RecentFlashcardSet
import com.examio.app.features.study.repository.FlashcardRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class MyMaterialsState(
    val isLoading: Boolean = false,
    val sets: List<RecentFlashcardSet> = emptyList(),
    val error: String? = null,
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
                is ApiResult.Error -> _state.value = _state.value.copy(
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

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
