package com.examio.app.features.account.models

import com.examio.app.core.network.PaginatedResponse
import kotlinx.serialization.Serializable

@Serializable
data class Transaction(
    val id: String,
    val amount: Double,
    val type: String,
    val status: String,
    val description: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class WalletDetails(
    val balance: Double,
    val transactions: PaginatedResponse<Transaction>,
)

@Serializable
data class SubscriptionPlan(
    val id: String,
    val name: String,
    val price: Double,
    val credits: Int,
    val description: String? = null,
)
