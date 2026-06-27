package com.examio.app.features.exams

// Exam status derived from attempt.status Int from the API.
fun examStatusLabel(status: Int): String = when (status) {
    0 -> "Đang làm"
    1 -> "Hoàn thành"
    2 -> "Hết giờ"
    else -> "Chưa biết"
}
