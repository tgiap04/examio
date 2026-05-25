package com.examio.app.features.account.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.account.models.UpdateProfileData
import com.examio.app.features.account.models.UserProfile
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.put
import io.ktor.client.request.setBody


class ProfileApiService(private val client: HttpClient) {
    suspend fun getProfile(): ApiResult<UserProfile> = safeApiCall { client.get(ApiEndpoints.PROFILE) }
    suspend fun updateProfile(data: UpdateProfileData): ApiResult<UserProfile> = safeApiCall { client.put(ApiEndpoints.PROFILE) { setBody(data) } }
}
