package com.examio.app.features.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.account.models.SubscriptionPlan
import com.examio.app.features.account.models.Transaction
import com.examio.app.features.account.models.WalletDetails
import com.examio.app.features.account.repository.AccountRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class WalletState(
    val isLoading: Boolean = false,
    val wallet: WalletDetails? = null,
    val plans: List<SubscriptionPlan> = emptyList(),
    val error: String? = null,
)

class WalletViewModel(private val repo: AccountRepository) : ViewModel() {
    private val _state = MutableStateFlow(WalletState())
    val state: StateFlow<WalletState> = _state

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            val walletResult = repo.wallet()
            val plansResult = repo.subscriptionPlans()
            val wallet = when (walletResult) {
                is ApiResult.Success -> walletResult.data
                is ApiResult.HttpError -> { _state.value = _state.value.copy(isLoading = false, error = walletResult.message); return@launch }
                is ApiResult.NetworkError -> { _state.value = _state.value.copy(isLoading = false, error = "Lỗi mạng"); return@launch }
            }
            val plans = when (plansResult) {
                is ApiResult.Success -> plansResult.data
                else -> emptyList()
            }
            _state.value = _state.value.copy(isLoading = false, wallet = wallet, plans = plans)
        }
    }

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }
}
