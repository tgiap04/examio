package com.examio.app.features.exams.room

/** Sub-navigation state for the exam-room flow, layered inside the DeThi tab. */
sealed interface ExamRoomsNavState {
    data object List : ExamRoomsNavState
    data object Create : ExamRoomsNavState
    data class Detail(val roomId: String, val roomTitle: String) : ExamRoomsNavState
    data class CreateSession(val roomId: String, val roomTitle: String) : ExamRoomsNavState
}
