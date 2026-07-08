package com.examio.app.features.exams.room

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.exams.models.ExamRoom
import com.examio.app.features.exams.models.ExamSession
import com.examio.app.features.exams.repository.ExamRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class ExamRoomDetailState(
    val isLoading: Boolean = false,
    val room: ExamRoom? = null,
    val sessions: List<ExamSession> = emptyList(),
    val error: String? = null,
    val deletingId: String? = null,
)

class ExamRoomDetailViewModel(
    private val roomId: String,
    private val repository: ExamRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ExamRoomDetailState())
    val state: StateFlow<ExamRoomDetailState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            when (val room = repository.examRoom(roomId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(room = room.data)
                is ApiResult.HttpError -> { _state.value = _state.value.copy(isLoading = false, error = room.message); return@launch }
                is ApiResult.NetworkError -> { _state.value = _state.value.copy(isLoading = false, error = room.message); return@launch }
            }
            when (val res = repository.examRoomSessions(roomId, page = 1, limit = 50)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isLoading = false, sessions = res.data.sessions)
                is ApiResult.HttpError -> _state.value = _state.value.copy(isLoading = false, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoading = false, error = res.message)
            }
        }
    }

    fun deleteSession(id: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(deletingId = id)
            when (val res = repository.deleteExamSession(id)) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    deletingId = null,
                    sessions = _state.value.sessions.filterNot { it.id == id },
                )
                is ApiResult.HttpError -> _state.value = _state.value.copy(deletingId = null, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(deletingId = null, error = res.message)
            }
        }
    }
}
