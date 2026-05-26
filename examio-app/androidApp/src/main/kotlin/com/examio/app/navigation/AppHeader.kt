package com.examio.app.navigation

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.examio.app.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppHeader(
    onProfileTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TopAppBar(
        modifier = modifier,
        title = {
            Image(
                painter = painterResource(R.drawable.examio_lightmode),
                contentDescription = "Examio",
                modifier = Modifier.height(30.dp),
            )
        },
        actions = {
            IconButton(onClick = onProfileTap) {
                Icon(Icons.Outlined.AccountCircle, contentDescription = "Profile")
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFFFFF7F1)),
    )
}
