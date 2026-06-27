package com.examio.app.features.account

import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.examio.app.features.account.repository.AccountRepository

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileSheet(
    accountRepository: AccountRepository,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val profileVm = remember { ProfileViewModel(accountRepository) }
    val walletVm = remember { WalletViewModel(accountRepository) }
    val profileState by profileVm.state.collectAsState()
    val walletState by walletVm.state.collectAsState()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = modifier.fillMaxHeight(0.92f),
    ) {
        AccountScreen(
            profileState = profileState,
            walletState = walletState,
            onUpdateProfile = { name, bio -> profileVm.updateProfile(name, bio) },
            onRefreshWallet = { walletVm.load() },
            onLogout = onDismiss,
        )
    }
}
