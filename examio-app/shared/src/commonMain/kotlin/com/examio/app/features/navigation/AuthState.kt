package com.examio.app.features.navigation

data class UserSession(
    val userId: String,
    val roles: Set<UserRole> = emptySet(),
)

enum class UserRole {
    Student,
    Teacher,
    Admin,
}

sealed interface NavigationAuthState {
    data object Loading : NavigationAuthState
    data object Unauthenticated : NavigationAuthState
    data class Authenticated(val session: UserSession) : NavigationAuthState
}
