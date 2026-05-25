package com.examio.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.examio.app.backend.AndroidAppContainer
import com.examio.app.design.ExamioTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appContainer = AndroidAppContainer(this)

        setContent {
            ExamioTheme {
                ExamioApp(authRepository = appContainer.authRepository)
            }
        }
    }
}
