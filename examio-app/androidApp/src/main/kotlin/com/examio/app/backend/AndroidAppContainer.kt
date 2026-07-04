package com.examio.app.backend

import android.content.Context
import com.examio.app.BuildConfig
import com.examio.app.core.config.AppConfig
import com.examio.app.core.config.MobileApiConfig
import com.examio.app.core.crypto.QuizDecryptor
import com.examio.app.core.network.HttpClientFactory
import com.examio.app.core.network.MultipartUploadHelper
import com.examio.app.core.network.createSSEClient
import com.examio.app.features.account.api.ProfileApiService
import com.examio.app.features.account.api.WalletApiService
import com.examio.app.features.account.repository.AccountRepository
import com.examio.app.features.ai.api.AIChatApiService
import com.examio.app.features.ai.api.AIGeneratorApiService
import com.examio.app.features.ai.api.SubjectApiService
import com.examio.app.features.ai.repository.AIChatRepository
import com.examio.app.features.auth.api.AuthApiService
import com.examio.app.features.auth.repository.AuthRepository
import com.examio.app.features.exams.api.ExamAttemptApiService
import com.examio.app.features.exams.api.ExamRoomApiService
import com.examio.app.features.exams.api.QuizSetApiService
import com.examio.app.features.exams.repository.ExamRepository
import com.examio.app.features.history.api.HistoryApiService
import com.examio.app.features.history.repository.HistoryRepository
import com.examio.app.features.study.api.FlashcardApiService
import com.examio.app.features.study.api.StudentMaterialsApiService
import com.examio.app.features.study.repository.FlashcardRepository

class AndroidAppContainer(context: Context) {
    private val tokenStorage = AndroidSecureTokenStorage(context.applicationContext)
    private val httpClient = HttpClientFactory.create(
        config = AppConfig(
            apiBaseUrl = MobileApiConfig.apiBaseUrl,
            environmentName = if (BuildConfig.DEBUG) "debug" else "release",
        ),
        tokenStorage = tokenStorage,
    )

    val multipartHelper = MultipartUploadHelper(httpClient)

    val authRepository = AuthRepository(
        api = AuthApiService(httpClient),
        tokenStorage = tokenStorage,
    )

    val accountRepository = AccountRepository(
        profileApi = ProfileApiService(httpClient, multipartHelper),
        walletApi = WalletApiService(httpClient),
    )

    val studentMaterialsApi = StudentMaterialsApiService(httpClient)

    val flashcardRepository = FlashcardRepository(
        flashcards = FlashcardApiService(httpClient),
        materials = studentMaterialsApi,
    )

    val examRepository = ExamRepository(
        quizSets = QuizSetApiService(httpClient),
        rooms = ExamRoomApiService(httpClient),
        attempts = ExamAttemptApiService(httpClient),
        decryptor = QuizDecryptor(MobileApiConfig.quizAesKey),
    )

    val historyRepository = HistoryRepository(
        api = HistoryApiService(httpClient),
    )

    val aiRepository = AIChatRepository(
        chatApi = AIChatApiService(httpClient),
        generatorApi = AIGeneratorApiService(httpClient, multipartHelper),
        subjectApi = SubjectApiService(httpClient),
        sseClient = createSSEClient(),
    )
}
