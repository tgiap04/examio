package com.examio.app.features.study

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.study.models.Flashcard
import com.examio.app.features.study.models.FlashcardSet
import com.examio.app.features.study.repository.FlashcardRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class FlashcardSetDetailState(
    val isLoading: Boolean = false,
    val set: FlashcardSet? = null,
    val cards: List<Flashcard> = emptyList(),
    val error: String? = null,
    // study mode
    val studyIndex: Int = 0,
    val isAnswerVisible: Boolean = false,
)

class FlashcardSetDetailViewModel(
    private val setId: String,
    private val repo: FlashcardRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(FlashcardSetDetailState())
    val state: StateFlow<FlashcardSetDetailState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            val setResult = repo.get(setId)
            val cardsResult = repo.cards(setId)
            val set = if (setResult is ApiResult.Success) setResult.data else null
            val cards = if (cardsResult is ApiResult.Success) cardsResult.data.flashCards else emptyList()
            val err = when {
                setResult is ApiResult.HttpError -> setResult.message
                setResult is ApiResult.NetworkError -> setResult.message
                cardsResult is ApiResult.HttpError -> cardsResult.message
                cardsResult is ApiResult.NetworkError -> cardsResult.message
                else -> null
            }
            _state.value = _state.value.copy(isLoading = false, set = set, cards = cards, error = err)
        }
    }

    fun flipCard() { _state.value = _state.value.copy(isAnswerVisible = !_state.value.isAnswerVisible) }
    fun nextCard() {
        val s = _state.value
        if (s.studyIndex < s.cards.lastIndex)
            _state.value = s.copy(studyIndex = s.studyIndex + 1, isAnswerVisible = false)
    }
    fun previousCard() {
        val s = _state.value
        if (s.studyIndex > 0)
            _state.value = s.copy(studyIndex = s.studyIndex - 1, isAnswerVisible = false)
    }
    fun clearError() { _state.value = _state.value.copy(error = null) }
}
