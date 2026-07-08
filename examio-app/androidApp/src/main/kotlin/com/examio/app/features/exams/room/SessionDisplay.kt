package com.examio.app.features.exams.room

import com.examio.app.features.exams.models.ExamSession
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val displayFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.systemDefault())

/** Format an ISO-8601 instant string for display in local time, or "" if null/unparsable. */
fun formatSessionTime(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    return try {
        displayFormatter.format(Instant.parse(iso))
    } catch (e: Exception) {
        iso
    }
}

/**
 * Human-readable status label. Prefers the backend-authoritative status
 * (0 UPCOMING / 1 ONGOING / 2 ENDED); falls back to deriving from the time window.
 */
fun sessionStatusLabel(session: ExamSession): String = when (session.status) {
    0 -> "Sắp diễn ra"
    1 -> "Đang diễn ra"
    2 -> "Đã kết thúc"
    else -> {
        val now = Instant.now()
        val start = session.startTime?.let { runCatching { Instant.parse(it) }.getOrNull() }
        val end = session.endTime?.let { runCatching { Instant.parse(it) }.getOrNull() }
        when {
            start != null && now.isBefore(start) -> "Sắp diễn ra"
            end != null && now.isAfter(end) -> "Đã kết thúc"
            else -> "Đang diễn ra"
        }
    }
}
