package com.examio.app.features.study

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.examio.app.features.study.repository.FlashcardRepository

/**
 * Study tab router: materials list → study a set → manage that set's cards.
 * Each destination lives in its own file (MyMaterialsScreen, FlashcardStudyScreen,
 * FlashcardManageScreen) to keep files small.
 */
@Composable
fun StudyScreen(
    flashcardRepository: FlashcardRepository,
    onGenerateWithAi: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val materialsVM = remember { MyMaterialsViewModel(flashcardRepository) }
    var selectedSetId by remember { mutableStateOf<String?>(null) }
    var managing by remember { mutableStateOf<Pair<String, String>?>(null) }

    val manageTarget = managing
    when {
        manageTarget != null -> {
            FlashcardManageScreen(
                setId = manageTarget.first,
                setTitle = manageTarget.second,
                repository = flashcardRepository,
                onBack = { managing = null },
                modifier = modifier,
            )
        }
        selectedSetId == null -> {
            Column(modifier = modifier.fillMaxSize()) {
                OutlinedButton(
                    onClick = onGenerateWithAi,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                ) { Text("Tạo flashcard bằng AI") }
                MyMaterialsScreen(
                    vm = materialsVM,
                    onOpenSet = { selectedSetId = it },
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                )
            }
        }
        else -> {
            val detailVM = remember(selectedSetId) {
                FlashcardSetDetailViewModel(selectedSetId!!, flashcardRepository)
            }
            FlashcardSetDetailScreen(
                vm = detailVM,
                onBack = { selectedSetId = null },
                onManage = { title -> managing = selectedSetId!! to title },
                modifier = modifier,
            )
        }
    }
}
