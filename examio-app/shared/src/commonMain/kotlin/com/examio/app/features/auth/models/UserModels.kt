package com.examio.app.features.auth.models

import kotlinx.serialization.Serializable

@Serializable
enum class UserRole { Student, Teacher, Admin }

@Serializable
data class User(
    val id: String,
    val email: String,
    val username: String? = null,
    val name: String? = null,
    val avatar: String? = null,
    val banner: String? = null,
    val bio: String? = null,
    val isVerified: Boolean = false,
    val roles: List<UserRole> = emptyList(),
    val createdAt: String? = null,
    val updatedAt: String? = null,
)
