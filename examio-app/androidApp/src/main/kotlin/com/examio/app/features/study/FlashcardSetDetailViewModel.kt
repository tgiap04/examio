package com.examio.app.features.study

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.study.models.Flashcard
import com.examio.app.features.study.models.FlashcardSet
import com.examio.app.features.study.models.FlashcardStudyData
import com.examio.app.features.study.repository.FlashcardRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

enum class StudyMode { Sequential, Shuffle, ReviewUnmastered }

data class FlashcardSetDetailState(
    val isLoading: Boolean = false,
    val set: FlashcardSet? = null,
    val cards: List<Flashcard> = emptyList(),
    val error: String? = null,
    // access flow (mirrors FE web study page)
    val requiresCode: Boolean = false,
    val isDenied: Boolean = false,
    val isSubmittingCode: Boolean = false,
    val codeError: String? = null,
    // study mode
    val studyIndex: Int = 0,
    val isAnswerVisible: Boolean = false,
    val mode: StudyMode = StudyMode.Sequential,
    val shuffledOrder: List<Int> = emptyList(), // indices into `cards`
    val masteredCardIds: Set<String> = emptySet(),
    val isComplete: Boolean = false,
) {
    /** Cards active under the current mode, in display order. */
    val activeCards: List<Flashcard>
        get() = when (mode) {
            StudyMode.Sequential -> cards
            StudyMode.Shuffle -> shuffledOrder.mapNotNull { cards.getOrNull(it) }
            StudyMode.ReviewUnmastered -> cards.filter { it.id !in masteredCardIds }
        }
}

class FlashcardSetDetailViewModel(
    private val setId: String,
    private val repo: FlashcardRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(FlashcardSetDetailState())
    val state: StateFlow<FlashcardSetDetailState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(
                isLoading = true, error = null, requiresCode = false, isDenied = false,
            )
            when (val access = repo.checkAccess(setId)) {
                is ApiResult.Success -> when {
                    access.data.hasAccess -> fetchStudyData()
                    access.data.requiresCode || access.data.accessType == "code_required" ->
                        _state.value = _state.value.copy(isLoading = false, requiresCode = true)
                    else -> _state.value = _state.value.copy(isLoading = false, isDenied = true)
                }
                is ApiResult.HttpError -> _state.value = _state.value.copy(isLoading = false, error = access.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoading = false, error = access.message)
            }
        }
    }

    private suspend fun fetchStudyData() {
        when (val result = repo.studyDetail(setId)) {
            is ApiResult.Success -> applyStudyData(result.data)
            is ApiResult.HttpError -> _state.value = _state.value.copy(isLoading = false, error = result.message)
            is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoading = false, error = result.message)
        }
    }

    /** Submit a 6-char access code for a code-protected set. */
    fun submitCode(code: String) {
        if (_state.value.isSubmittingCode) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmittingCode = true, codeError = null)
            when (val result = repo.studyWithCode(setId, code.trim())) {
                is ApiResult.Success -> applyStudyData(result.data)
                is ApiResult.HttpError ->
                    _state.value = _state.value.copy(isSubmittingCode = false, codeError = result.message)
                is ApiResult.NetworkError ->
                    _state.value = _state.value.copy(isSubmittingCode = false, codeError = result.message)
            }
        }
    }

    private fun applyStudyData(data: FlashcardStudyData) {
        _state.value = _state.value.copy(
            isLoading = false,
            isSubmittingCode = false,
            requiresCode = false,
            isDenied = false,
            codeError = null,
            set = FlashcardSet(
                id = data.id,
                title = data.title,
                description = data.description,
                thumbnail = data.thumbnail,
                flashcardCount = data.cardCount,
                isPublic = data.isPublic,
            ),
            cards = data.flashCards,
            // Start the deck fresh — guards against stale study state on re-load.
            studyIndex = 0,
            isAnswerVisible = false,
            isComplete = false,
            masteredCardIds = emptySet(),
            shuffledOrder = emptyList(),
        )
    }

    fun flipCard() { _state.value = _state.value.copy(isAnswerVisible = !_state.value.isAnswerVisible) }

    fun nextCard() {
        val s = _state.value
        val nextIndex = s.studyIndex + 1
        _state.value = if (nextIndex >= s.activeCards.size) {
            s.copy(isComplete = true, isAnswerVisible = false)
        } else {
            s.copy(studyIndex = nextIndex, isAnswerVisible = false)
        }
    }

    fun previousCard() {
        val s = _state.value
        if (s.studyIndex > 0)
            _state.value = s.copy(studyIndex = s.studyIndex - 1, isAnswerVisible = false)
    }

    fun setMode(mode: StudyMode) {
        val s = _state.value
        val shuffled = if (mode == StudyMode.Shuffle) s.cards.indices.shuffled() else s.shuffledOrder
        _state.value = s.copy(
            mode = mode,
            shuffledOrder = shuffled,
            studyIndex = 0,
            isAnswerVisible = false,
            isComplete = false,
        )
    }

    fun markMastered(cardId: String) {
        val s = _state.value
        val newMastered = s.masteredCardIds + cardId
        val updated = s.copy(masteredCardIds = newMastered)
        val nextIndex = s.studyIndex + 1
        // After mastering, recompute completion against the (possibly shrunk) active set.
        _state.value = if (nextIndex >= updated.activeCards.size) {
            updated.copy(isComplete = true, isAnswerVisible = false)
        } else {
            updated.copy(studyIndex = nextIndex, isAnswerVisible = false)
        }
    }

    fun restart() {
        _state.value = _state.value.copy(studyIndex = 0, isAnswerVisible = false, isComplete = false)
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
