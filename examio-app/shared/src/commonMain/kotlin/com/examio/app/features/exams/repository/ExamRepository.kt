package com.examio.app.features.exams.repository

import com.examio.app.features.exams.api.ExamAttemptApiService
import com.examio.app.features.exams.api.ExamRoomApiService
import com.examio.app.features.exams.api.QuizSetApiService
import com.examio.app.features.exams.models.CreateQuizSetRequest
import com.examio.app.features.exams.models.StartExamAttemptRequest
import com.examio.app.features.exams.models.SubmitExamAttemptRequest

class ExamRepository(
    private val quizSets: QuizSetApiService,
    private val rooms: ExamRoomApiService,
    private val attempts: ExamAttemptApiService,
) {
    suspend fun quizSets(page: Int = 1, limit: Int = 20, search: String? = null) = quizSets.list(page, limit, search)
    suspend fun createQuizSet(request: CreateQuizSetRequest) = quizSets.create(request)
    suspend fun updateQuizSet(id: String, request: CreateQuizSetRequest) = quizSets.update(id, request)
    suspend fun deleteQuizSet(id: String) = quizSets.delete(id)
    suspend fun examRooms(page: Int = 1, limit: Int = 20) = rooms.list(page, limit)
    suspend fun examRoom(id: String) = rooms.get(id)
    suspend fun examRoomSessions(roomId: String) = rooms.sessions(roomId)
    suspend fun attempts(page: Int = 1, limit: Int = 20) = attempts.list(page, limit)
    suspend fun startAttempt(sessionId: String) = attempts.start(StartExamAttemptRequest(sessionId))
    suspend fun secureQuiz(attemptId: String) = attempts.secureQuiz(attemptId)
    suspend fun submit(attemptId: String, request: SubmitExamAttemptRequest) = attempts.submit(attemptId, request)
}
