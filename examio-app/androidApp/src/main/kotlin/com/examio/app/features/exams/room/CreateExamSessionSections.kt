package com.examio.app.features.exams.room

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Clear
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.examio.app.features.exams.models.AvailableLabel
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset

/** A read-only field that opens a date picker then a time picker, returning epoch millis. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateTimeField(
    label: String,
    valueMillis: Long?,
    onChange: (Long?) -> Unit,
    clearable: Boolean = false,
    modifier: Modifier = Modifier,
) {
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }
    var pickedDate by remember { mutableStateOf<LocalDate?>(null) }

    OutlinedTextField(
        value = if (valueMillis != null) formatSessionTime(Instant.ofEpochMilli(valueMillis).toString()) else "",
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        placeholder = { Text("Chọn thời gian") },
        trailingIcon = {
            Row {
                if (clearable && valueMillis != null) {
                    IconButton(onClick = { onChange(null) }) { Icon(Icons.Outlined.Clear, contentDescription = "Xoá") }
                }
                IconButton(onClick = { showDate = true }) { Icon(Icons.Outlined.CalendarMonth, contentDescription = "Chọn ngày") }
            }
        },
        modifier = modifier,
    )

    if (showDate) {
        // Material3 DatePicker expects UTC-midnight-of-date millis; convert the local instant to that.
        val initialDateMillis = valueMillis?.let {
            Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).toLocalDate()
                .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        }
        val dateState = rememberDatePickerState(initialSelectedDateMillis = initialDateMillis)
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                TextButton(onClick = {
                    dateState.selectedDateMillis?.let { millis ->
                        pickedDate = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                    }
                    showDate = false
                    showTime = true
                }) { Text("Tiếp tục") }
            },
            dismissButton = { TextButton(onClick = { showDate = false }) { Text("Huỷ") } },
        ) { DatePicker(state = dateState) }
    }

    if (showTime) {
        val existing = valueMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()) }
        val timeState = rememberTimePickerState(
            initialHour = existing?.hour ?: 8,
            initialMinute = existing?.minute ?: 0,
            is24Hour = true,
        )
        Dialog(onDismissRequest = { showTime = false }) {
            Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface) {
                Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Chọn giờ", style = MaterialTheme.typography.titleMedium)
                    TimePicker(state = timeState)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { showTime = false }) { Text("Huỷ") }
                        TextButton(onClick = {
                            val date = pickedDate ?: LocalDate.now()
                            val ldt = LocalDateTime.of(date, LocalTime.of(timeState.hour, timeState.minute))
                            onChange(ldt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli())
                            showTime = false
                        }) { Text("Xong") }
                    }
                }
            }
        }
    }
}

/** Per-label question count row for RANDOM_BY_LABEL mode. */
@Composable
fun LabelCountRow(
    label: AvailableLabel,
    count: Int,
    onCountChange: (Int) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = "${label.name} (${label.questionCount})",
            onValueChange = {},
            readOnly = true,
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = if (count > 0) count.toString() else "",
            onValueChange = { v ->
                val n = v.filter { it.isDigit() }.toIntOrNull() ?: 0
                onCountChange(n.coerceIn(0, label.questionCount))
            },
            placeholder = { Text("0") },
            singleLine = true,
            modifier = Modifier.weight(0.4f),
        )
    }
}
