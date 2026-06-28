package com.examio.app.core.config

data class AppConfig(
    val apiBaseUrl: String,
    val environmentName: String,
    // Raw AES key for secure-quiz decryption (un-sliced); matches BE/FE QUIZ_AES_KEY.
    val quizAesKey: String = "",
)
