package com.examio.app.features.exams

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.exams.models.CreateQuestionRequest
import com.examio.app.features.exams.models.Question
import com.examio.app.features.exams.models.UpdateQuestionRequest
import com.examio.app.features.exams.repository.ExamRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class QuizSetManageState(
    val isLoading: Boolean = false,
    val setTitle: String = "",
    val questions: List<Question> = emptyList(),
    val error: String? = null,
    val editing: Question? = null, // null + showEditSheet=true => adding new
    val showEditSheet: Boolean = false,
    val isSaving: Boolean = false,
    val deletingId: String? = null,
)

class QuizSetManageViewModel(
    private val setId: String,
    private val setTitle: String,
    private val repository: ExamRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(QuizSetManageState(setTitle = setTitle))
    val state: StateFlow<QuizSetManageState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            when (val res = repository.quizSetQuestions(setId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isLoading = false, questions = res.data.questions)
                is ApiResult.HttpError -> _state.value = _state.value.copy(isLoading = false, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoading = false, error = res.message)
            }
        }
    }

    fun showAdd() { _state.value = _state.value.copy(editing = null, showEditSheet = true) }
    fun showEdit(q: Question) { _state.value = _state.value.copy(editing = q, showEditSheet = true) }
    fun dismissSheet() { _state.value = _state.value.copy(showEditSheet = false, editing = null) }

    fun save(question: String, options: List<String>, answer: String, explanation: String?) {
        val editing = _state.value.editing
        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, error = null)
            val res = if (editing == null) {
                repository.addQuestion(setId, CreateQuestionRequest(question = question, options = options, answer = answer))
            } else {
                repository.updateQuestion(
                    setId, editing.id,
                    UpdateQuestionRequest(question = question, options = options, answer = answer),
                )
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

    fun delete(questionId: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(deletingId = questionId)
            when (val res = repository.deleteQuestion(setId, questionId)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(
                        deletingId = null,
                        questions = _state.value.questions.filterNot { it.id == questionId },
                    )
                }
                is ApiResult.HttpError -> _state.value = _state.value.copy(deletingId = null, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(deletingId = null, error = res.message)
            }
        }
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
