package com.examio.app.features.exams

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Style
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun DeThiScreen(modifier: Modifier = Modifier) {
    LazyColumn(
        modifier = modifier.fillMaxSize().background(Color(0xFFFFF7F1)).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Đề thi", style = MaterialTheme.typography.headlineLarge, color = Color(0xFF2D211B))
                Text("Quản lý bộ đề, flashcard và phòng thi từ một nơi.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                StatCard("24", "Bộ đề", Modifier.weight(1f))
                StatCard("312", "Câu hỏi", Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = { }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Outlined.Style, contentDescription = null)
                    Text(" Flash Card")
                }
                OutlinedButton(onClick = { }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Outlined.Groups, contentDescription = null)
                    Text(" Phòng thi")
                }
            }
        }
        items(examSets) { item -> ExamSetCard(item) }
        item {
            ExtendedFloatingActionButton(onClick = { }, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("Tạo bộ đề") }, containerColor = Color(0xFFCC785C), contentColor = Color.White)
        }
    }
}

@Composable
private fun StatCard(value: String, label: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier, shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(value, style = MaterialTheme.typography.headlineSmall, color = Color(0xFFCC785C))
            Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ExamSetCard(item: String) {
    Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(item, style = MaterialTheme.typography.titleMedium, color = Color(0xFF2D211B))
            Text("32 câu hỏi • Đang hoạt động • Cập nhật hôm nay", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private val examSets = listOf("Ôn tập Toán cao cấp", "Kiểm tra Sinh học 12", "Đề luyện tiếng Anh B1")
