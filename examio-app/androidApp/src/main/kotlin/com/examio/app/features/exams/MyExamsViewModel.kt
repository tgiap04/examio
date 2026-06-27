package com.examio.app.features.exams

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.exams.models.RecentExamAttempt
import com.examio.app.features.study.api.StudentMaterialsApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class MyExamsState(
    val isLoading: Boolean = false,
    val attempts: List<RecentExamAttempt> = emptyList(),
    val error: String? = null,
)

class MyExamsViewModel(private val materials: StudentMaterialsApiService) : ViewModel() {
    private val _state = MutableStateFlow(MyExamsState())
    val state: StateFlow<MyExamsState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            when (val result = materials.recentExams()) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    isLoading = false,
                    attempts = result.data.examAttempts,
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
            materials.toggleExamRoomPin(id)
            load()
        }
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
