package com.examio.app.features.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.examio.app.R

/**
 * Shared card-based auth screen layout matching examio-fe responsive style.
 * All auth screens (Register, ForgotPassword, ResetPassword) use this shell.
 */
@Composable
fun AuthCardShell(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFFFFF7EE), Color(0xFFFAF9F5), Color(0xFFEFE9DE)),
                ),
            ),
    ) {
        Box(
            Modifier
                .padding(top = 48.dp, start = 24.dp)
                .size(150.dp)
                .clip(CircleShape)
                .background(Color(0x33CC785C)),
        )
        Box(
            Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 24.dp, end = 8.dp)
                .size(210.dp)
                .clip(CircleShape)
                .background(Color(0x26F2B66D)),
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            AuthBrandHeader()
            Spacer(Modifier.height(22.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xF8FFFCF8)),
                elevation = CardDefaults.cardElevation(defaultElevation = 10.dp),
                border = BorderStroke(1.dp, Color(0xFFE8D7C8)),
            ) {
                Column(
                    modifier = Modifier.padding(22.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Text(title, color = Color(0xFF141413), fontSize = 26.sp, fontWeight = FontWeight.Bold)
                    Text(subtitle, color = Color(0xFF6B625B), style = androidx.compose.material3.MaterialTheme.typography.bodyMedium)
                    content()
                }
            }
        }
    }
}
