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
