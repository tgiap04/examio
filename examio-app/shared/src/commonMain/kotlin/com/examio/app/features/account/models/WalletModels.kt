package com.examio.app.features.account.models

import kotlinx.serialization.Serializable

@Serializable
data class UsageBreakdown(
    val examGeneration: Int = 0,
    val flashcardCreation: Int = 0,
    val pdfProcessing: Int = 0,
)

@Serializable
data class Transaction(
    val id: String,
    val amount: Double,
    val type: Int,
    val typeLabel: String? = null,
    val direction: String? = null,  // "ADD" or "SUBTRACT"
    val description: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class TransactionPagination(
    val data: List<Transaction> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val size: Int = 10,
    val totalPages: Int = 0,
)

@Serializable
data class WalletDetails(
    val id: String,
    val balance: Double,
    val totalPurchased: Double = 0.0,
    val totalUsed: Double = 0.0,
    val usageBreakdown: UsageBreakdown = UsageBreakdown(),
    val transactions: TransactionPagination = TransactionPagination(),
)

@Serializable
data class SubscriptionPlan(
    val tier: Int,
    val name: String,
    val nameVi: String? = null,
    val creditsPerMonth: Int = 0,
    val filesPerMonth: Int = 0,
    val messagesPerMinute: Int = 0,
    val chatMessagesLimit: Int = 0,
    val priceMonthly: Double = 0.0,
    val priceYearly: Double = 0.0,
)

@Serializable
data class UploadImageResponse(
    val url: String,
)
