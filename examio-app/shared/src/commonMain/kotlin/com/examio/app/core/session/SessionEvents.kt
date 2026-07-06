package com.examio.app.core.session

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * App-wide signal that the session became unrecoverably invalid (a 401 that survived a
 * token refresh). UI layers collect [expired] to return the user to the login screen,
 * mirroring examio-fe's 401 → /login redirect. Emitted by [com.examio.app.core.network.AuthInterceptor]
 * right after it clears the stored tokens.
 */
object SessionEvents {
    private val _expired = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val expired: SharedFlow<Unit> = _expired.asSharedFlow()

    fun notifyExpired() {
        _expired.tryEmit(Unit)
    }
}
