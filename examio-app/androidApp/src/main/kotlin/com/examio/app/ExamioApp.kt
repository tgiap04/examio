package com.examio.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.examio.app.core.network.ApiResult
import com.examio.app.features.account.ProfileSheet
import com.examio.app.features.account.repository.AccountRepository
import com.examio.app.features.auth.AuthNavGraph
import com.examio.app.features.auth.models.User
import com.examio.app.features.auth.repository.AuthRepository
import com.examio.app.features.exams.DeThiScreen
import com.examio.app.features.study.api.StudentMaterialsApiService
import com.examio.app.features.study.repository.FlashcardRepository
import com.examio.app.features.exams.MyExamsScreen
import com.examio.app.features.history.LichSuScreen
import com.examio.app.features.history.repository.HistoryRepository
import com.examio.app.features.navigation.MainTab
import com.examio.app.features.navigation.NavigationAuthState
import com.examio.app.features.navigation.UserRole
import com.examio.app.features.navigation.UserSession
import com.examio.app.features.study.StudyScreen
import com.examio.app.navigation.AppHeader
import com.examio.app.navigation.BottomTabBar

@Composable
fun ExamioApp(
    authRepository: AuthRepository,
    accountRepository: AccountRepository,
    flashcardRepository: FlashcardRepository,
    studentMaterialsApi: StudentMaterialsApiService,
    historyRepository: HistoryRepository,
) {
    var authState by remember { mutableStateOf<NavigationAuthState>(NavigationAuthState.Loading) }
    var selectedTab by remember { mutableStateOf(MainTab.TaiLieu) }
    var showProfile by remember { mutableStateOf(false) }

    // Restore the persisted session on startup so a reload doesn't force re-login.
    // restoreSession() reads stored tokens, calls currentUser(), falls back to refresh()
    // on expiry, and silently clears tokens on 401/403.
    LaunchedEffect(Unit) {
        authState = when (val result = authRepository.restoreSession()) {
            is ApiResult.Success -> NavigationAuthState.Authenticated(result.data.user.toSession())
            else -> NavigationAuthState.Unauthenticated
        }
    }

    when (authState) {
        is NavigationAuthState.Loading -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return
        }
        is NavigationAuthState.Unauthenticated -> {
            AuthNavGraph(
                authRepository = authRepository,
                onAuthenticated = { user ->
                    authState = NavigationAuthState.Authenticated(user.toSession())
                },
            )
            return
        }
        is NavigationAuthState.Authenticated -> Unit
    }

    Scaffold(
        topBar = {
            AppHeader(onProfileTap = { showProfile = true })
        },
        bottomBar = {
            BottomTabBar(
                selectedTab = selectedTab,
                onTabSelected = { selectedTab = it },
            )
        },
    ) { innerPadding ->
        val modifier = Modifier.padding(innerPadding)

        when (selectedTab) {
            MainTab.TaiLieu -> StudyScreen(flashcardRepository = flashcardRepository, modifier = modifier)
            MainTab.BaiThi -> MyExamsScreen(materialsApi = studentMaterialsApi, modifier = modifier)
            MainTab.DeThi -> DeThiScreen(modifier)
            MainTab.LichSu -> LichSuScreen(historyRepository = historyRepository, modifier = modifier)
        }
    }

    if (showProfile) {
        ProfileSheet(
            accountRepository = accountRepository,
            onDismiss = { showProfile = false },
        )
    }
}

private fun User?.toSession(): UserSession =
    UserSession(
        userId = this?.id ?: "local-session",
        roles = if (this?.roles?.any { it.name == UserRole.Teacher.name } == true) {
            setOf(UserRole.Teacher)
        } else {
            setOf(UserRole.Student)
        },
    )
