package com.examio.app.features.ai

import com.examio.app.features.ai.models.JobStatus
import com.examio.app.features.exams.models.SaveHistoryToQuizsetRequest
import com.examio.app.features.study.models.SaveHistoryToFlashcardSetRequest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Locks the client ↔ gateway contract that P01 fixed. The backend emits lowercase
 * job statuses (pending/processing/completed/failed) and returns generated content
 * inline on a completed job — the orphaned client used to expect DONE/RUNNING and
 * had no quizzes/flashcards fields, so the poller hung and nothing could be previewed.
 */
class AiGenerationContractTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun parsesCompletedQuizJobExactlyAsBackendReturnsIt() {
        // Shape mirrors exam-service ai.service.ts getJobStatus() completed-quiz branch.
        val payload = """
            {
              "jobId": "u-123",
              "status": "completed",
              "result": {
                "type": "quiz",
                "quizzes": [
                  {"question": "2+2?", "options": ["3", "4", "5"], "answer": "4"}
                ],
                "historyId": "hist-quiz-1",
                "fileInfo": {"id": "u-123", "filename": "doc.pdf"}
              }
            }
        """.trimIndent()

        val status = json.decodeFromString<JobStatus>(payload)

        assertEquals("completed", status.status)
        assertNotNull(status.result)
        assertEquals("quiz", status.result!!.type)
        assertEquals("hist-quiz-1", status.result!!.historyId)
        assertEquals(1, status.result!!.quizzes?.size)
        assertEquals("4", status.result!!.quizzes!!.first().answer)
    }

    @Test
    fun parsesCompletedFlashcardJob() {
        val payload = """
            {
              "jobId": "u-9",
              "status": "completed",
              "result": {
                "type": "flashcard",
                "flashcards": [{"question": "Thủ đô VN?", "answer": "Hà Nội"}],
                "historyId": "hist-fc-1"
              }
            }
        """.trimIndent()

        val status = json.decodeFromString<JobStatus>(payload)

        assertEquals("flashcard", status.result?.type)
        assertEquals("Hà Nội", status.result?.flashcards?.first()?.answer)
    }

    @Test
    fun parsesInProgressStatusWithoutResult() {
        val status = json.decodeFromString<JobStatus>("""{"jobId":"u-1","status":"processing"}""")
        assertEquals("processing", status.status)
        assertEquals(null, status.result)
    }

    @Test
    fun saveHistoryRequestsSerializeWithBackendFieldNames() {
        val quizJson = json.encodeToString<SaveHistoryToQuizsetRequest>(
            SaveHistoryToQuizsetRequest(quizsetIds = listOf("qs-1"), historyId = "h-1"),
        )
        assertTrue(quizJson.contains("\"quizsetIds\""), "quiz request must use quizsetIds")
        assertTrue(quizJson.contains("\"historyId\""))

        val fcJson = json.encodeToString<SaveHistoryToFlashcardSetRequest>(
            SaveHistoryToFlashcardSetRequest(flashcardsetIds = listOf("fs-1"), historyId = "h-2"),
        )
        assertTrue(fcJson.contains("\"flashcardsetIds\""), "flashcard request must use flashcardsetIds")
        assertTrue(fcJson.contains("\"historyId\""))
    }
}
