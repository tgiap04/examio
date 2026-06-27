package com.examio.app

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.examio.app.features.account.ProfileSheet
import com.examio.app.features.account.repository.AccountRepository
import com.examio.app.features.ai.AiScreen
import com.examio.app.features.ai.repository.AIChatRepository
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
    aiRepository: AIChatRepository,
    historyRepository: HistoryRepository,
) {
    var authState by remember { mutableStateOf<NavigationAuthState>(NavigationAuthState.Unauthenticated) }
    var selectedTab by remember { mutableStateOf(MainTab.AiTool) }
    var showProfile by remember { mutableStateOf(false) }

    if (authState !is NavigationAuthState.Authenticated) {
        AuthNavGraph(
            authRepository = authRepository,
            onAuthenticated = { user ->
                authState = NavigationAuthState.Authenticated(user.toSession())
            },
        )
        return
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
            MainTab.AiTool -> AiScreen(aiRepository = aiRepository, modifier = modifier)
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
