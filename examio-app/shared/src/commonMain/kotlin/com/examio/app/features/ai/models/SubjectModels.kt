package com.examio.app.features.ai.models

import kotlinx.serialization.Serializable

@Serializable
data class SubjectCategory(
    val id: String,
    val name: String,
    val description: String? = null,
    val icon: String? = null,
)

@Serializable
data class Subject(
    val id: String,
    val name: String,
    val slug: String,
    val description: String? = null,
    val categoryId: String? = null,
)
