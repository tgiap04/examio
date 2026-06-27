package com.examio.app.features.exams.models

import kotlinx.serialization.Serializable

@Serializable
data class QuizSetLabel(val id: String, val name: String, val color: String? = null)

@Serializable
data class Question(
    val id: String,
    val question: String,
    val options: List<String> = emptyList(),
    val correctAnswer: String? = null,
    val explanation: String? = null,
)

@Serializable
data class QuizSet(
    val id: String,
    val title: String,
    val description: String? = null,
    val questionCount: Int = 0,
    val isPublic: Boolean = false,
    val labels: List<QuizSetLabel> = emptyList(),
    val createdAt: String? = null,
)

@Serializable
data class CreateQuizSetRequest(
    val title: String,
    val description: String? = null,
    val isPublic: Boolean = false,
)

@Serializable
data class QuizSetListResponse(
    val quizSets: List<QuizSet>,
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val totalPages: Int = 1,
)

@Serializable
data class QuizSetCreateResponse(
    val quizSet: QuizSet,
)

@Serializable
data class QuizSetQuestionsResponse(
    val questions: List<Question>,
    val pagination: QuizSetPagination? = null,
)

@Serializable
data class QuizSetPagination(
    val page: Int,
    val limit: Int,
    val total: Int,
    val totalPages: Int,
)

@Serializable
data class CreateQuestionRequest(
    val question: String,
    val options: List<String>,
    val answer: String,
    val labelId: String? = null,
)

@Serializable
data class UpdateQuestionRequest(
    val question: String? = null,
    val options: List<String>? = null,
    val answer: String? = null,
    val labelId: String? = null,
)

@Serializable
data class QuizSetLabelsResponse(
    val labels: List<QuizSetLabel>,
    val unlabeledCount: Int = 0,
)
