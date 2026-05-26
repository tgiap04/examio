package com.examio.app

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object OAuthCallbackHolder {
    private val _callback = MutableStateFlow<String?>(null)
    val callback: StateFlow<String?> = _callback.asStateFlow()

    fun set(url: String) { _callback.value = url }
    fun clear() { _callback.value = null }
}
