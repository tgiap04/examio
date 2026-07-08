package com.examio.app.features.exams.room

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.exams.models.ExamRoom
import com.examio.app.features.exams.repository.ExamRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class ExamRoomsState(
    val isLoading: Boolean = false,
    val rooms: List<ExamRoom> = emptyList(),
    val error: String? = null,
    val deletingId: String? = null,
)

class ExamRoomsViewModel(private val repository: ExamRepository) : ViewModel() {
    private val _state = MutableStateFlow(ExamRoomsState())
    val state: StateFlow<ExamRoomsState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            when (val res = repository.examRooms(page = 1, limit = 50)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isLoading = false, rooms = res.data.examRooms)
                is ApiResult.HttpError -> _state.value = _state.value.copy(isLoading = false, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoading = false, error = res.message)
            }
        }
    }

    fun deleteRoom(id: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(deletingId = id)
            when (val res = repository.deleteExamRoom(id)) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    deletingId = null,
                    rooms = _state.value.rooms.filterNot { it.id == id },
                )
                is ApiResult.HttpError -> _state.value = _state.value.copy(deletingId = null, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(deletingId = null, error = res.message)
            }
        }
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
