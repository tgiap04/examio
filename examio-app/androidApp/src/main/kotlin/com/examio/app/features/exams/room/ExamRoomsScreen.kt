package com.examio.app.features.exams.room

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.examio.app.design.ExamioCard
import com.examio.app.design.ExamioCardShape
import com.examio.app.features.exams.models.ExamRoom
import com.examio.app.features.exams.repository.ExamRepository

/** Coordinator for the exam-room flow: list ↔ create ↔ detail ↔ create-session. */
@Composable
fun ExamRoomsScreen(
    examRepository: ExamRepository,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var nav by remember { mutableStateOf<ExamRoomsNavState>(ExamRoomsNavState.List) }

    when (val n = nav) {
        ExamRoomsNavState.List -> ExamRoomsListScreen(
            examRepository = examRepository,
            onBack = onBack,
            onCreate = { nav = ExamRoomsNavState.Create },
            onOpen = { room -> nav = ExamRoomsNavState.Detail(room.id, room.title) },
            modifier = modifier,
        )
        ExamRoomsNavState.Create -> CreateExamRoomScreen(
            examRepository = examRepository,
            onBack = { nav = ExamRoomsNavState.List },
            onCreated = { nav = ExamRoomsNavState.List },
            modifier = modifier,
        )
        is ExamRoomsNavState.Detail -> ExamRoomDetailScreen(
            examRepository = examRepository,
            roomId = n.roomId,
            roomTitle = n.roomTitle,
            onBack = { nav = ExamRoomsNavState.List },
            onCreateSession = { nav = ExamRoomsNavState.CreateSession(n.roomId, n.roomTitle) },
            modifier = modifier,
        )
        is ExamRoomsNavState.CreateSession -> CreateExamSessionScreen(
            examRepository = examRepository,
            roomId = n.roomId,
            roomTitle = n.roomTitle,
            onBack = { nav = ExamRoomsNavState.Detail(n.roomId, n.roomTitle) },
            onCreated = { nav = ExamRoomsNavState.Detail(n.roomId, n.roomTitle) },
            modifier = modifier,
        )
    }
}

@Composable
private fun ExamRoomsListScreen(
    examRepository: ExamRepository,
    onBack: () -> Unit,
    onCreate: () -> Unit,
    onOpen: (ExamRoom) -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm = remember { ExamRoomsViewModel(examRepository) }
    val state by vm.state.collectAsState()
    var pendingDelete by remember { mutableStateOf<ExamRoom?>(null) }

    Box(modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(8.dp)) }
            item { BackRow(label = "Đề thi", onBack = onBack) }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Phòng thi", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
                    Text("Quản lý phòng thi và các phiên thi của bạn.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            if (state.isLoading) {
                item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = MaterialTheme.colorScheme.primary) } }
            }
            state.error?.let { err ->
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = { vm.load() }) { Text("Thử lại") }
                    }
                }
            }
            if (!state.isLoading && state.rooms.isEmpty() && state.error == null) {
                item {
                    Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) {
                        Text("Chưa có phòng thi nào", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            items(state.rooms, key = { it.id }) { room ->
                ExamRoomCard(room = room, onClick = { onOpen(room) }, onDelete = { pendingDelete = room })
            }
            item { Spacer(Modifier.height(72.dp)) }
        }

        Button(
            onClick = onCreate,
            modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary),
            shape = RoundedCornerShape(14.dp),
        ) {
            Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text("Tạo phòng thi")
        }
    }

    pendingDelete?.let { room ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Xóa phòng thi") },
            text = { Text("Bạn có chắc muốn xóa \"${room.title}\"? Hành động này không thể hoàn tác.") },
            confirmButton = { TextButton(onClick = { vm.deleteRoom(room.id); pendingDelete = null }) { Text("Xóa", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("Huỷ") } },
        )
    }
}

@Composable
internal fun BackRow(label: String, onBack: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable(onClick = onBack)) {
        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Quay lại", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun ExamRoomCard(room: ExamRoom, onClick: () -> Unit, onDelete: () -> Unit) {
    ExamioCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick), shape = ExamioCardShape) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Outlined.MeetingRoom, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary) }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(room.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
                Text(
                    (room.quizSet?.title?.let { "$it • " } ?: "") + "${room.count?.examSessions ?: 0} phiên thi",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Outlined.Delete, contentDescription = "Xóa", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
            }
        }
    }
}
