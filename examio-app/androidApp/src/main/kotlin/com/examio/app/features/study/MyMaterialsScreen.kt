package com.examio.app.features.study

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.examio.app.features.study.components.FlashcardSetEditSheet
import com.examio.app.features.study.components.FlashcardSetEmptyState
import com.examio.app.features.study.components.FlashcardSetListItem

@Composable
fun MyMaterialsScreen(
    vm: MyMaterialsViewModel,
    onOpenSet: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsState()

    Box(modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(8.dp)) }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        "Học tập",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Text(
                        "Bộ flashcard của bạn — tạo, ôn luyện và quản lý mỗi ngày.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (state.isLoading) {
                item {
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }
            }

            state.error?.let { err ->
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = { vm.load() }) { Text("Thử lại") }
                    }
                }
            }

            if (!state.isLoading && state.sets.isEmpty() && state.error == null) {
                item { FlashcardSetEmptyState(onCreate = { vm.openCreate() }) }
            }

            items(state.sets, key = { it.id }) { set ->
                FlashcardSetListItem(
                    set = set,
                    onOpen = { onOpenSet(set.id) },
                    onTogglePin = { vm.togglePin(set.id) },
                    onRename = { vm.openEdit(set) },
                    onDelete = { vm.requestDelete(set) },
                )
            }

            item { Spacer(Modifier.height(80.dp)) }
        }

        Button(
            onClick = { vm.openCreate() },
            modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ),
            shape = RoundedCornerShape(14.dp),
        ) {
            Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text("Tạo bộ")
        }
    }

    if (state.isSheetOpen) {
        FlashcardSetEditSheet(
            existing = state.editing,
            isSaving = state.isSaving,
            onSave = { title, description -> vm.saveSet(title, description) },
            onDismiss = { vm.dismissSheet() },
        )
    }

    state.pendingDelete?.let { target ->
        AlertDialog(
            onDismissRequest = { vm.dismissDelete() },
            title = { Text("Xoá bộ flashcard") },
            text = { Text("Xoá \"${target.title}\"? Toàn bộ thẻ trong bộ này sẽ bị xoá và không thể khôi phục.") },
            confirmButton = {
                TextButton(onClick = { vm.confirmDelete() }) {
                    Text("Xoá", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { vm.dismissDelete() }) { Text("Huỷ") } },
        )
    }
}
