package com.examio.app.features.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.history.models.ExamHistoryItem
import com.examio.app.features.history.models.HistoryStats
import com.examio.app.features.history.models.PDFHistoryItem
import com.examio.app.features.history.repository.HistoryRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class HistoryState(
    val isLoading: Boolean = false,
    val stats: HistoryStats? = null,
    val pdfs: List<PDFHistoryItem> = emptyList(),
    val exams: List<ExamHistoryItem> = emptyList(),
    val error: String? = null,
)

class HistoryViewModel(private val repository: HistoryRepository) : ViewModel() {

    private val _state = MutableStateFlow(HistoryState())
    val state: StateFlow<HistoryState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            val statsDeferred = async { repository.stats() }
            val pdfsDeferred = async { repository.pdfHistory() }
            val examsDeferred = async { repository.examHistory() }

            val stats = statsDeferred.await()
            val pdfs = pdfsDeferred.await()
            val exams = examsDeferred.await()

            _state.value = _state.value.copy(
                isLoading = false,
                stats = (stats as? ApiResult.Success)?.data,
                pdfs = (pdfs as? ApiResult.Success)?.data ?: emptyList(),
                exams = (exams as? ApiResult.Success)?.data?.examAttempts ?: emptyList(),
                error = when {
                    stats is ApiResult.HttpError -> stats.message
                    stats is ApiResult.NetworkError -> "Lỗi kết nối"
                    else -> null
                },
            )
        }
    }
}
