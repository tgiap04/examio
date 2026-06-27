package com.examio.app.features.account.repository

import com.examio.app.core.network.PlatformFile
import com.examio.app.features.account.api.ProfileApiService
import com.examio.app.features.account.api.WalletApiService
import com.examio.app.features.account.models.UpdateProfileData

class AccountRepository(
    private val profileApi: ProfileApiService,
    private val walletApi: WalletApiService,
) {
    suspend fun profile() = profileApi.getProfile()
    suspend fun updateProfile(data: UpdateProfileData) = profileApi.updateProfile(data)
    suspend fun uploadAvatar(file: PlatformFile) = profileApi.uploadAvatar(file)
    suspend fun uploadBanner(file: PlatformFile) = profileApi.uploadBanner(file)
    suspend fun wallet(page: Int = 1, limit: Int = 20) = walletApi.details(page, limit)
    suspend fun subscriptionPlans() = walletApi.plans()
}
