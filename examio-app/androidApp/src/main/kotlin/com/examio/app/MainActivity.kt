package com.examio.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.examio.app.backend.AndroidAppContainer
import com.examio.app.core.storage.initSecureTokenStorage
import com.examio.app.design.ExamioTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        initSecureTokenStorage(this)
        val appContainer = AndroidAppContainer(this)

        intent.data?.let { uri ->
            if (uri.scheme == "examio" && uri.host == "auth") {
                OAuthCallbackHolder.set(uri.toString())
            }
        }

        setContent {
            ExamioTheme {
                ExamioApp(
                    authRepository = appContainer.authRepository,
                    accountRepository = appContainer.accountRepository,
                    flashcardRepository = appContainer.flashcardRepository,
                    studentMaterialsApi = appContainer.studentMaterialsApi,
                    historyRepository = appContainer.historyRepository,
                    examRepository = appContainer.examRepository,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.data?.let { uri ->
            if (uri.scheme == "examio" && uri.host == "auth") {
                OAuthCallbackHolder.set(uri.toString())
            }
        }
    }
}
