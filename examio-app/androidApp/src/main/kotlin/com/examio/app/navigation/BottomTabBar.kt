package com.examio.app.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.School
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.examio.app.features.navigation.MainTab

@Composable
fun BottomTabBar(
    selectedTab: MainTab,
    onTabSelected: (MainTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    NavigationBar(
        modifier = modifier,
        containerColor = Color.White,
        tonalElevation = 4.dp,
    ) {
        MainTab.entries.forEach { tab ->
            NavigationBarItem(
                selected = tab == selectedTab,
                onClick = { onTabSelected(tab) },
                icon = { Icon(tab.icon, contentDescription = tab.title) },
                label = { Text(tab.title, maxLines = 1) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Color(0xFFCC785C),
                    selectedTextColor = Color(0xFFCC785C),
                    indicatorColor = Color(0x33CC785C),
                ),
            )
        }
    }
}

private val MainTab.icon: ImageVector
    get() = when (this) {
        MainTab.AiTool -> Icons.Outlined.AutoAwesome
        MainTab.TaiLieu -> Icons.Outlined.MenuBook
        MainTab.BaiThi -> Icons.Outlined.School
        MainTab.DeThi -> Icons.Outlined.Description
        MainTab.LichSu -> Icons.Outlined.History
    }
