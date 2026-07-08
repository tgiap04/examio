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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.examio.app.core.network.ApiResult
import com.examio.app.core.session.SessionEvents
import com.examio.app.features.account.ProfileSheet
import com.examio.app.features.account.repository.AccountRepository
import com.examio.app.features.auth.AuthNavGraph
import com.examio.app.features.auth.models.User
import com.examio.app.features.auth.repository.AuthRepository
import com.examio.app.features.exams.DeThiScreen
import com.examio.app.features.exams.ExamNavState
import com.examio.app.features.exams.ExamResultScreen
import com.examio.app.features.exams.ExamTakingScreen
import com.examio.app.features.ai.AiScreen
import com.examio.app.features.ai.repository.AIGeneratorRepository
import com.examio.app.features.exams.repository.ExamRepository
import com.examio.app.features.exams.session.ExamSessionLandingScreen
import com.examio.app.features.exams.session.JoinSessionScreen
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
    examRepository: ExamRepository,
    aiRepository: AIGeneratorRepository,
) {
    var authState by remember { mutableStateOf<NavigationAuthState>(NavigationAuthState.Loading) }
    var selectedTab by remember { mutableStateOf(MainTab.TaiLieu) }
    var showProfile by remember { mutableStateOf(false) }
    var examNav by remember { mutableStateOf<ExamNavState>(ExamNavState.Idle) }
    // Non-null while the AI generator overlay is open; holds the preset typeResult (1=quiz, 2=flashcard).
    // rememberSaveable so the overlay survives Activity recreation while the system file picker is
    // foregrounded (guaranteed with "Don't keep activities", common under memory pressure) — otherwise
    // the picked file returns to a recomposed screen where the overlay has been reset to null.
    var aiGenerateType by rememberSaveable { mutableStateOf<Int?>(null) }

    // Restore the persisted session on startup so a reload doesn't force re-login.
    // restoreSession() reads stored tokens, calls currentUser(), falls back to refresh()
    // on expiry, and silently clears tokens on 401/403.
    LaunchedEffect(Unit) {
        authState = when (val result = authRepository.restoreSession()) {
            is ApiResult.Success -> NavigationAuthState.Authenticated(result.data.user.toSession())
            else -> NavigationAuthState.Unauthenticated
        }
    }

    // Return to login the moment the session dies mid-use (unrecoverable 401 from the
    // AuthInterceptor), so a revoked session doesn't leave the user stuck on authed screens.
    LaunchedEffect(Unit) {
        SessionEvents.expired.collect {
            authState = NavigationAuthState.Unauthenticated
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

    // Full-screen exam flow overlays the tab Scaffold entirely.
    when (val nav = examNav) {
        is ExamNavState.TakingExam -> {
            ExamTakingScreen(
                examSessionId = nav.examSessionId,
                repository = examRepository,
                onExit = { examNav = ExamNavState.Idle },
                onSubmitted = { examNav = ExamNavState.ShowResult(it, nav.examTitle) },
                modifier = Modifier.fillMaxSize(),
            )
            return
        }
        is ExamNavState.ShowResult -> {
            ExamResultScreen(
                result = nav.result,
                examTitle = nav.examTitle,
                onClose = { examNav = ExamNavState.Idle },
                modifier = Modifier.fillMaxSize(),
            )
            return
        }
        ExamNavState.Joining -> {
            JoinSessionScreen(
                onBack = { examNav = ExamNavState.Idle },
                onOpen = { sessionId -> examNav = ExamNavState.SessionLanding(sessionId) },
                modifier = Modifier.fillMaxSize(),
            )
            return
        }
        is ExamNavState.SessionLanding -> {
            ExamSessionLandingScreen(
                sessionId = nav.sessionId,
                examRepository = examRepository,
                onBack = { examNav = ExamNavState.Idle },
                onStart = { title -> examNav = ExamNavState.TakingExam(nav.sessionId, title) },
                modifier = Modifier.fillMaxSize(),
            )
            return
        }
        ExamNavState.Idle -> Unit
    }

    // AI generation overlays the tab Scaffold, opened from Study/DeThi entry buttons.
    aiGenerateType?.let { type ->
        AiScreen(
            aiRepository = aiRepository,
            examRepository = examRepository,
            flashcardRepository = flashcardRepository,
            initialTypeResult = type,
            onClose = { aiGenerateType = null },
            modifier = Modifier.fillMaxSize(),
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
            MainTab.TaiLieu -> StudyScreen(
                flashcardRepository = flashcardRepository,
                onGenerateWithAi = { aiGenerateType = 2 },
                modifier = modifier,
            )
            MainTab.BaiThi -> MyExamsScreen(
                materialsApi = studentMaterialsApi,
                onEnterExam = { sessionId, title -> examNav = ExamNavState.TakingExam(sessionId, title) },
                onJoinSession = { examNav = ExamNavState.Joining },
                modifier = modifier,
            )
            MainTab.DeThi -> DeThiScreen(
                examRepository = examRepository,
                onGenerateWithAi = { aiGenerateType = 1 },
                onTakeSession = { sessionId, title -> examNav = ExamNavState.TakingExam(sessionId, title) },
                modifier = modifier,
            )
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
