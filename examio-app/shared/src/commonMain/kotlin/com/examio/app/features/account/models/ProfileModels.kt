package com.examio.app.features.account.models

import kotlinx.serialization.Serializable

@Serializable
data class UserProfile(
    val id: String,
    val email: String,
    val username: String? = null,
    val name: String? = null,
    val avatar: String? = null,
    val banner: String? = null,
    val bio: String? = null,
    val isVerified: Boolean = false,
)

@Serializable
data class UpdateProfileData(
    val name: String? = null,
    val username: String? = null,
    val bio: String? = null,
)
