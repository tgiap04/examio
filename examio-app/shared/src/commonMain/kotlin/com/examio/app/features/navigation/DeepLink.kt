package com.examio.app.features.navigation

sealed interface DeepLink {
    data class ExamSession(val sessionId: String) : DeepLink
    data class Flashcard(val setId: String) : DeepLink
    data class Chat(val chatId: String) : DeepLink
    data object Profile : DeepLink
}

fun parseDeepLink(rawUrl: String): DeepLink? {
    val normalized = rawUrl
        .removePrefix("examio://")
        .removePrefix("https://examio.vn/")
        .trim('/')
    val parts = normalized.split('/').filter { it.isNotBlank() }

    return when (parts.firstOrNull()) {
        "exam-session" -> parts.getOrNull(1)?.let(DeepLink::ExamSession)
        "flashcard", "study" -> parts.getOrNull(1)?.let(DeepLink::Flashcard)
        "chat" -> parts.getOrNull(1)?.let(DeepLink::Chat)
        "profile" -> DeepLink.Profile
        else -> null
    }
}

fun DeepLink.targetTab(): MainTab = when (this) {
    is DeepLink.ExamSession -> MainTab.MyExams
    is DeepLink.Flashcard -> MainTab.Study
    is DeepLink.Chat -> MainTab.Ai
    DeepLink.Profile -> MainTab.Account
}
