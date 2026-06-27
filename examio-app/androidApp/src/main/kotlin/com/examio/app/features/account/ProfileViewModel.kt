package com.examio.app.features.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.PlatformFile
import com.examio.app.features.account.models.UpdateProfileData
import com.examio.app.features.account.models.UserProfile
import com.examio.app.features.account.repository.AccountRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class ProfileState(
    val isLoading: Boolean = false,
    val profile: UserProfile? = null,
    val error: String? = null,
    val uploadingAvatar: Boolean = false,
    val uploadingBanner: Boolean = false,
)

class ProfileViewModel(private val repo: AccountRepository) : ViewModel() {
    private val _state = MutableStateFlow(ProfileState())
    val state: StateFlow<ProfileState> = _state

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            when (val r = repo.profile()) {
                is ApiResult.Success -> _state.value = _state.value.copy(isLoading = false, profile = r.data)
                is ApiResult.HttpError -> _state.value = _state.value.copy(isLoading = false, error = r.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoading = false, error = "Lỗi mạng")
            }
        }
    }

    fun updateProfile(name: String?, bio: String?) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true)
            when (val r = repo.updateProfile(UpdateProfileData(name = name, bio = bio))) {
                is ApiResult.Success -> _state.value = _state.value.copy(isLoading = false, profile = r.data)
                is ApiResult.HttpError -> _state.value = _state.value.copy(isLoading = false, error = r.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoading = false, error = "Lỗi mạng")
            }
        }
    }

    fun uploadAvatar(file: PlatformFile) {
        viewModelScope.launch {
            _state.value = _state.value.copy(uploadingAvatar = true)
            when (val r = repo.uploadAvatar(file)) {
                is ApiResult.Success -> {
                    // Reload profile to get updated avatar URL
                    _state.value = _state.value.copy(uploadingAvatar = false)
                    load()
                }
                is ApiResult.HttpError -> _state.value = _state.value.copy(uploadingAvatar = false, error = r.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(uploadingAvatar = false, error = "Lỗi mạng")
            }
        }
    }

    fun uploadBanner(file: PlatformFile) {
        viewModelScope.launch {
            _state.value = _state.value.copy(uploadingBanner = true)
            when (val r = repo.uploadBanner(file)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(uploadingBanner = false)
                    load()
                }
                is ApiResult.HttpError -> _state.value = _state.value.copy(uploadingBanner = false, error = r.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(uploadingBanner = false, error = "Lỗi mạng")
            }
        }
    }

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }
}
