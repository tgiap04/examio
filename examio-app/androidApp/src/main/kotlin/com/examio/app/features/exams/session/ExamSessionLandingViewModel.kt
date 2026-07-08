package com.examio.app.features.exams.session

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.exams.models.SessionAccessCheck
import com.examio.app.features.exams.models.SessionPublicInfo
import com.examio.app.features.exams.repository.ExamRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class SessionLandingState(
    val isLoading: Boolean = false,
    val info: SessionPublicInfo? = null,
    val access: SessionAccessCheck? = null,
    val verified: Boolean = false,
    val codeError: String? = null,
    val verifying: Boolean = false,
    val error: String? = null,
) {
    val needCode: Boolean get() = access?.accessType == "code_required" && !verified
    val denied: Boolean get() = access?.accessType == "denied"
    val canStart: Boolean get() = (access?.hasAccess == true) || verified
}

class ExamSessionLandingViewModel(
    private val sessionId: String,
    private val repository: ExamRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(SessionLandingState())
    val state: StateFlow<SessionLandingState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            when (val access = repository.sessionAccess(sessionId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(access = access.data)
                is ApiResult.HttpError -> { _state.value = _state.value.copy(isLoading = false, error = access.message); return@launch }
                is ApiResult.NetworkError -> { _state.value = _state.value.copy(isLoading = false, error = access.message); return@launch }
            }
            when (val info = repository.sessionInfo(sessionId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isLoading = false, info = info.data)
                is ApiResult.HttpError -> _state.value = _state.value.copy(isLoading = false, error = info.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoading = false, error = info.message)
            }
        }
    }

    fun verifyCode(code: String) {
        if (!Regex("^\\d{6}$").matches(code)) {
            _state.value = _state.value.copy(codeError = "Mã truy cập phải gồm 6 chữ số")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(verifying = true, codeError = null)
            when (val res = repository.verifySessionCode(sessionId, code)) {
                is ApiResult.Success ->
                    if (res.data.valid) _state.value = _state.value.copy(verifying = false, verified = true)
                    else _state.value = _state.value.copy(verifying = false, codeError = res.data.message ?: "Mã truy cập không đúng")
                is ApiResult.HttpError -> _state.value = _state.value.copy(verifying = false, codeError = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(verifying = false, codeError = res.message)
            }
        }
    }
}
