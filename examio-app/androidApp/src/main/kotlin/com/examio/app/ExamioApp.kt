package com.examio.app

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.examio.app.features.account.AccountScreen
import com.examio.app.features.ai.AiScreen
import com.examio.app.features.auth.AuthNavGraph
import com.examio.app.features.auth.models.User
import com.examio.app.features.auth.repository.AuthRepository
import com.examio.app.features.exams.MyExamsScreen
import com.examio.app.features.home.HomeScreen
import com.examio.app.features.navigation.MainTab
import com.examio.app.features.navigation.NavigationAuthState
import com.examio.app.features.navigation.UserRole
import com.examio.app.features.navigation.UserSession
import com.examio.app.features.study.StudyScreen
import com.examio.app.navigation.BottomTabBar

@Composable
fun ExamioApp(authRepository: AuthRepository) {
    var authState by remember { mutableStateOf<NavigationAuthState>(NavigationAuthState.Unauthenticated) }
    var selectedTab by remember { mutableStateOf(MainTab.Home) }

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
        bottomBar = {
            BottomTabBar(
                selectedTab = selectedTab,
                onTabSelected = { selectedTab = it },
            )
        },
    ) { innerPadding ->
        val modifier = Modifier.padding(innerPadding)

        when (selectedTab) {
            MainTab.Home -> HomeScreen(modifier)
            MainTab.Study -> StudyScreen(modifier)
            MainTab.MyExams -> MyExamsScreen(modifier)
            MainTab.Ai -> AiScreen(modifier)
            MainTab.Account -> AccountScreen(modifier)
        }
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
