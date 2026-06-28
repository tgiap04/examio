package com.examio.app.features.exams

import com.examio.app.features.exams.models.SecureSubmitResponse

/** Full-screen exam flow overlay state, layered above the tab Scaffold. */
sealed interface ExamNavState {
    data object Idle : ExamNavState
    data class TakingExam(val examSessionId: String, val examTitle: String = "") : ExamNavState
    data class ShowResult(val result: SecureSubmitResponse, val examTitle: String = "") : ExamNavState
}
