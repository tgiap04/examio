package com.examio.app.features.exams.models

import kotlinx.serialization.Serializable

@Serializable
enum class ExamSessionStatus { Draft, Scheduled, Active, Completed, Cancelled }

@Serializable
data class ExamRoom(
    val id: String,
    val title: String,
    val description: String? = null,
    val isPublic: Boolean = false,
    val createdAt: String? = null,
)

@Serializable
data class ExamSession(
    val id: String,
    val examRoomId: String,
    val title: String,
    val startsAt: String? = null,
    val endsAt: String? = null,
    val status: ExamSessionStatus = ExamSessionStatus.Draft,
    val accessCode: String? = null,
)
