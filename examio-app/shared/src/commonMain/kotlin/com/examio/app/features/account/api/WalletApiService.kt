package com.examio.app.features.account.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.account.models.SubscriptionPlan
import com.examio.app.features.account.models.WalletDetails
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter

class WalletApiService(private val client: HttpClient) {
    suspend fun details(page: Int = 1, limit: Int = 20): ApiResult<WalletDetails> = safeApiCall { client.get(ApiEndpoints.WALLET_DETAILS) { parameter("page", page); parameter("limit", limit) } }
    suspend fun plans(): ApiResult<List<SubscriptionPlan>> = safeApiCall { client.get("/payment/subscription/plans") }
}
