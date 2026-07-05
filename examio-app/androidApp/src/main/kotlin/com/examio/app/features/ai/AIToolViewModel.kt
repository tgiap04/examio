package com.examio.app.features.ai

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.PlatformFile
import com.examio.app.features.ai.models.JobResult
import com.examio.app.features.ai.models.JobStatus
import com.examio.app.features.ai.repository.AIGeneratorRepository
import com.examio.app.features.exams.models.CreateQuizSetRequest
import com.examio.app.features.exams.models.QuizSet
import com.examio.app.features.exams.models.SaveHistoryToQuizsetRequest
import com.examio.app.features.exams.repository.ExamRepository
import com.examio.app.features.study.models.CreateFlashcardSetRequest
import com.examio.app.features.study.models.FlashcardSet
import com.examio.app.features.study.models.SaveHistoryToFlashcardSetRequest
import com.examio.app.features.study.repository.FlashcardRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AiScreenState(
    // generator inputs
    val typeResult: Int = 1,
    val quantity: Int = 5,
    val keyword: String = "",
    val selectedFileName: String? = null,
    val isGenerating: Boolean = false,
    val jobStatus: JobStatus? = null,
    val generateError: String? = null,
    // completed generation + save-to-set
    val generatedResult: JobResult? = null,
    val quizSets: List<QuizSet> = emptyList(),
    val flashcardSets: List<FlashcardSet> = emptyList(),
    val isSaving: Boolean = false,
    val saveError: String? = null,
    val savedCount: Int? = null,
)

class AIToolViewModel(
    private val repository: AIGeneratorRepository,
    private val examRepository: ExamRepository,
    private val flashcardRepository: FlashcardRepository,
    private val context: Context,
) : ViewModel() {

    private val _state = MutableStateFlow(AiScreenState())
    val state: StateFlow<AiScreenState> = _state.asStateFlow()

    private var pendingUri: Uri? = null
    private var pollHandle: Job? = null

    // ── Generator ────────────────────────────────────────────────────────

    fun onTypeSelected(typeResult: Int) {
        _state.value = _state.value.copy(typeResult = typeResult)
    }

    fun onQuantityChange(quantity: Int) {
        _state.value = _state.value.copy(quantity = quantity.coerceIn(1, 50))
    }

    fun onKeywordChange(keyword: String) {
        _state.value = _state.value.copy(keyword = keyword)
    }

    fun onFileSelected(uri: Uri) {
        pendingUri = uri
        val name = resolveFilename(uri) ?: "file.pdf"
        _state.value = _state.value.copy(selectedFileName = name)
    }

    fun generate() {
        val uri = pendingUri ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(
                isGenerating = true,
                generateError = null,
                jobStatus = null,
                generatedResult = null,
                savedCount = null,
                saveError = null,
            )
            val filename = resolveFilename(uri) ?: "upload.pdf"
            val bytes = context.contentResolver.openInputStream(uri)?.readBytes()
            if (bytes == null) {
                _state.value = _state.value.copy(isGenerating = false, generateError = "Không đọc được file")
                return@launch
            }
            val platformFile = PlatformFile(
                filename = filename,
                mimeType = "application/pdf",
                bytes = bytes,
            )
            val keyword = _state.value.keyword.trim().takeIf { it.isNotEmpty() }
            when (val result = repository.generateFromFile(
                file = platformFile,
                typeResult = _state.value.typeResult,
                quantity = _state.value.quantity,
                keyword = keyword,
            )) {
                is ApiResult.Success -> pollJob(result.data.jobId)
                is ApiResult.HttpError -> _state.value = _state.value.copy(
                    isGenerating = false, generateError = result.message,
                )
                is ApiResult.NetworkError -> _state.value = _state.value.copy(
                    isGenerating = false, generateError = "Lỗi kết nối",
                )
            }
        }
    }

    private fun pollJob(jobId: String) {
        // Cancel any in-flight poll so a stale job can't overwrite fresher state.
        pollHandle?.cancel()
        pollHandle = viewModelScope.launch {
            repository.pollJob(jobId).collect { status ->
                _state.value = _state.value.copy(jobStatus = status)
                val normalized = status.status.lowercase()
                if (normalized in setOf("completed", "failed", "cancelled")) {
                    _state.value = _state.value.copy(isGenerating = false)
                    if (normalized == "completed") {
                        _state.value = _state.value.copy(generatedResult = status.result)
                        loadTargetSets()
                    }
                }
            }
        }
    }

    // ── Save generated result into a set ───────────────────────────────────

    // The generated content's true domain is the job result's own type, NOT the
    // mutable UI toggle — the backend resolves history by most-recent per type, so
    // result.type/historyId is the only trustworthy pairing at completion time.
    private fun resultIsQuiz(): Boolean = _state.value.generatedResult?.type == "quiz"

    // Load the sets the generated content can be saved into (quiz or flashcard).
    private fun loadTargetSets() {
        viewModelScope.launch {
            if (resultIsQuiz()) {
                when (val r = examRepository.quizSets(page = 1, limit = 100)) {
                    is ApiResult.Success -> _state.value = _state.value.copy(quizSets = r.data.quizSets)
                    else -> Unit
                }
            } else {
                when (val r = flashcardRepository.list(page = 1, limit = 100)) {
                    is ApiResult.Success -> _state.value = _state.value.copy(flashcardSets = r.data.flashcardSets)
                    else -> Unit
                }
            }
        }
    }

    // Create a brand-new set then persist the generated history into it.
    fun saveToNewSet(title: String) {
        val name = title.trim()
        if (name.isEmpty()) {
            _state.value = _state.value.copy(saveError = "Nhập tên bộ")
            return
        }
        val historyId = _state.value.generatedResult?.historyId ?: run {
            _state.value = _state.value.copy(saveError = "Chưa có kết quả để lưu")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, saveError = null)
            if (resultIsQuiz()) {
                when (val created = examRepository.createQuizSet(CreateQuizSetRequest(title = name))) {
                    is ApiResult.Success -> saveQuizHistory(created.data.quizSet.id, historyId)
                    is ApiResult.HttpError -> failSave(created.message)
                    is ApiResult.NetworkError -> failSave("Lỗi kết nối")
                }
            } else {
                when (val created = flashcardRepository.create(CreateFlashcardSetRequest(title = name))) {
                    is ApiResult.Success -> saveFlashcardHistory(created.data.id, historyId)
                    is ApiResult.HttpError -> failSave(created.message)
                    is ApiResult.NetworkError -> failSave("Lỗi kết nối")
                }
            }
        }
    }

    // Persist the generated history into an already-existing set.
    fun saveToExistingSet(setId: String) {
        val historyId = _state.value.generatedResult?.historyId ?: run {
            _state.value = _state.value.copy(saveError = "Chưa có kết quả để lưu")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, saveError = null)
            if (resultIsQuiz()) saveQuizHistory(setId, historyId)
            else saveFlashcardHistory(setId, historyId)
        }
    }

    private suspend fun saveQuizHistory(setId: String, historyId: String) {
        when (val r = examRepository.saveHistoryToQuizset(
            SaveHistoryToQuizsetRequest(quizsetIds = listOf(setId), historyId = historyId),
        )) {
            is ApiResult.Success -> _state.value = _state.value.copy(isSaving = false, savedCount = r.data.createdCount)
            is ApiResult.HttpError -> failSave(r.message)
            is ApiResult.NetworkError -> failSave("Lỗi kết nối")
        }
    }

    private suspend fun saveFlashcardHistory(setId: String, historyId: String) {
        when (val r = flashcardRepository.saveHistoryToFlashcardSet(
            SaveHistoryToFlashcardSetRequest(flashcardsetIds = listOf(setId), historyId = historyId),
        )) {
            is ApiResult.Success -> _state.value = _state.value.copy(isSaving = false, savedCount = r.data.createdCount)
            is ApiResult.HttpError -> failSave(r.message)
            is ApiResult.NetworkError -> failSave("Lỗi kết nối")
        }
    }

    private fun failSave(message: String) {
        _state.value = _state.value.copy(isSaving = false, saveError = message)
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private fun resolveFilename(uri: Uri): String? {
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && idx >= 0) return cursor.getString(idx)
        }
        return uri.lastPathSegment
    }
}
