package com.examio.app.features.ai

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.PlatformFile
import com.examio.app.features.ai.models.JobStatus
import com.examio.app.features.ai.models.RecentUpload
import com.examio.app.features.ai.repository.AIChatRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AiScreenState(
    // chat
    val chatsLoading: Boolean = false,
    val messages: List<AiChatMessage> = emptyList(),
    val input: String = "",
    val isSending: Boolean = false,
    val chatError: String? = null,
    val activeChatId: String? = null,
    // generator
    val typeResult: Int = 1,
    val quantity: Int = 5,
    val keyword: String = "",
    val selectedFileName: String? = null,
    val isGenerating: Boolean = false,
    val jobStatus: JobStatus? = null,
    val generateError: String? = null,
    // uploads history
    val uploadsLoading: Boolean = false,
    val uploads: List<RecentUpload> = emptyList(),
    val uploadsError: String? = null,
)

class AIToolViewModel(
    private val repository: AIChatRepository,
    private val context: Context,
) : ViewModel() {

    private val _state = MutableStateFlow(AiScreenState())
    val state: StateFlow<AiScreenState> = _state.asStateFlow()

    private var pendingUri: Uri? = null

    init {
        loadUploads()
    }

    // ── Chat ─────────────────────────────────────────────────────────────

    fun onInputChange(text: String) {
        _state.value = _state.value.copy(input = text)
    }

    fun sendMessage() {
        val text = _state.value.input.trim()
        if (text.isEmpty() || _state.value.isSending) return
        val userMsg = AiChatMessage(text = text, isUser = true)
        _state.value = _state.value.copy(
            input = "",
            isSending = true,
            chatError = null,
            messages = _state.value.messages + userMsg,
        )
        viewModelScope.launch {
            val request = com.examio.app.features.ai.models.SendMessageRequest(
                chatId = _state.value.activeChatId,
                content = text,
            )
            when (val result = repository.sendMessage(request)) {
                is ApiResult.Success -> {
                    val reply = AiChatMessage(text = result.data.content, isUser = false)
                    _state.value = _state.value.copy(
                        isSending = false,
                        activeChatId = result.data.chatId,
                        messages = _state.value.messages + reply,
                    )
                }
                is ApiResult.HttpError -> _state.value = _state.value.copy(
                    isSending = false, chatError = result.message,
                )
                is ApiResult.NetworkError -> _state.value = _state.value.copy(
                    isSending = false, chatError = "Lỗi kết nối",
                )
            }
        }
    }

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
        viewModelScope.launch {
            repository.pollJob(jobId).collect { status ->
                _state.value = _state.value.copy(jobStatus = status)
                if (status.status in setOf("DONE", "FAILED", "CANCELLED")) {
                    _state.value = _state.value.copy(isGenerating = false)
                    if (status.status == "DONE") loadUploads()
                }
            }
        }
    }

    // ── Uploads history ───────────────────────────────────────────────────

    fun loadUploads() {
        viewModelScope.launch {
            _state.value = _state.value.copy(uploadsLoading = true, uploadsError = null)
            when (val result = repository.recentUploads()) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    uploadsLoading = false, uploads = result.data,
                )
                is ApiResult.HttpError -> _state.value = _state.value.copy(
                    uploadsLoading = false, uploadsError = result.message,
                )
                is ApiResult.NetworkError -> _state.value = _state.value.copy(
                    uploadsLoading = false, uploadsError = "Lỗi kết nối",
                )
            }
        }
    }

    fun deleteUpload(uploadId: String) {
        viewModelScope.launch {
            repository.deleteUpload(uploadId)
            loadUploads()
        }
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
