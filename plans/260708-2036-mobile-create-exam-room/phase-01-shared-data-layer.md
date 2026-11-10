# Phase 01 — Shared Kotlin data layer

**Priority:** Cao (chặn phase 02, 03) · **Status:** ✅ DONE

## Mục tiêu
Cung cấp model + API + repository cho luồng phòng thi/phiên thi, dùng bởi Android VM.

## Files
**Sửa:**
- `shared/.../features/exams/models/ExamRoomModels.kt` — viết lại + thêm DTO
- `shared/.../features/exams/api/ExamRoomApiService.kt` — thêm create/delete, sửa list/sessions
- `shared/.../features/exams/repository/ExamRepository.kt` — thêm methods + constructor param
- `androidApp/.../backend/AndroidAppContainer.kt` — inject ExamSessionApiService

**Tạo:**
- `shared/.../features/exams/api/ExamSessionApiService.kt`

## ExamRoomModels.kt — nội dung
Giữ enum request dạng **Int** (BE dùng int enum), tránh sai serialization.
```kotlin
@Serializable data class QuizSetSummary(val id: String, val title: String, val description: String? = null)
@Serializable data class HostSummary(val id: String, val name: String? = null, val email: String? = null)
@Serializable data class ExamRoomCount(val examSessions: Int = 0)

@Serializable data class ExamRoom(
    val id: String, val title: String, val description: String? = null,
    val quizSetId: String? = null, val hostId: String? = null,
    val createdAt: String? = null, val updatedAt: String? = null,
    val quizSet: QuizSetSummary? = null, val host: HostSummary? = null,
    @SerialName("_count") val count: ExamRoomCount? = null,
)
@Serializable data class ExamRoomListResponse(
    val examRooms: List<ExamRoom> = emptyList(),
    val total: Int = 0, val page: Int = 1, val limit: Int = 20, val totalPages: Int = 1,
)
@Serializable data class CreateExamRoomRequest(val title: String, val description: String? = null, val quizSetId: String)
@Serializable data class CreateExamRoomResponse(val message: String? = null, val examRoom: ExamRoom)

// Session (align với BE: startTime/endTime/isActive/accessCode/assessType int)
@Serializable data class ExamSession(
    val id: String, val examRoomId: String,
    val startTime: String? = null, val endTime: String? = null,
    val accessCode: String? = null, val isActive: Boolean = false,
    val assessType: Int = 0, val maxAttempts: Int = 1,
    val questionCount: Int? = null, val distinctUserCount: Int = 0,
)
@Serializable data class ExamRoomSessionsResponse(
    val sessions: List<ExamSession> = emptyList(),
    val total: Int = 0, val page: Int = 1, val limit: Int = 10, val totalPages: Int = 1,
    val totalDistinctParticipants: Int = 0,
)
@Serializable data class LabelQuestionConfig(val labelId: String, val count: Int)
@Serializable data class CreateExamSessionRequest(
    val examRoomId: String,
    val startTime: String,               // ISO-8601 (Z)
    val endTime: String? = null,
    val assessType: Int = 0,             // 0 PUBLIC / 1 PRIVATE
    val allowRetake: Boolean = false,
    val maxAttempts: Int = 1,
    val accessCode: String? = null,      // 6 số khi PRIVATE-code
    val whitelist: List<String> = emptyList(),
    val showAnswersAfterSubmit: Boolean = true,
    val passingScore: Int = 40,
    val questionCount: Int? = null,
    val questionSelectionMode: Int = 0,  // 0 ALL /1 RANDOM_TOTAL /2 RANDOM_BY_LABEL
    val labelQuestionConfig: List<LabelQuestionConfig>? = null,
    val shuffleQuestions: Boolean = false,
    val autoJoinByLink: Boolean = false,
)
@Serializable data class CreateExamSessionResponse(val message: String? = null, val examSession: ExamSession)

// available-labels
@Serializable data class AvailableLabel(val id: String, val name: String, val color: String? = null, val questionCount: Int = 0)
@Serializable data class AvailableLabelsResponse(
    val totalQuestions: Int = 0, val labels: List<AvailableLabel> = emptyList(), val unlabeledCount: Int = 0,
)
// whitelist user search
@Serializable data class SearchUser(val id: String, val name: String? = null, val email: String? = null)
```
> Bỏ `enum ExamSessionStatus` cũ (không nơi nào dùng). Thêm `import kotlinx.serialization.SerialName`.

## ExamRoomApiService.kt — nội dung
```kotlin
suspend fun list(page=1, limit=20, search: String?=null): ApiResult<ExamRoomListResponse> =
    safeApiCall { client.get("${EXAM_ROOMS}/list") { parameter("page",page); parameter("limit",limit); search?.let{parameter("search",it)} } }
suspend fun get(id): ApiResult<ExamRoom> = safeApiCall { client.get("${EXAM_ROOMS}/detail/$id") }
suspend fun create(req: CreateExamRoomRequest): ApiResult<CreateExamRoomResponse> = safeApiCall { client.post(EXAM_ROOMS){setBody(req)} }
suspend fun delete(id): ApiResult<Unit> = safeUnitApiCall { client.delete("${EXAM_ROOMS}/$id") }
suspend fun sessions(roomId, page=1, limit=10): ApiResult<ExamRoomSessionsResponse> =
    safeApiCall { client.get("${EXAM_ROOMS}/$roomId/sessions"){parameter("page",page);parameter("limit",limit)} }
```

## ExamSessionApiService.kt (mới)
```kotlin
class ExamSessionApiService(private val client: HttpClient) {
  suspend fun create(req): ApiResult<CreateExamSessionResponse> = safeApiCall { client.post(EXAM_SESSIONS){setBody(req)} }
  suspend fun delete(id): ApiResult<Unit> = safeUnitApiCall { client.delete("${EXAM_SESSIONS}/$id") }
  suspend fun availableLabels(roomId): ApiResult<AvailableLabelsResponse> =
      safeApiCall { client.get("${EXAM_SESSIONS}/room/$roomId/available-labels") }
  suspend fun searchUsers(q): ApiResult<List<SearchUser>> =
      safeApiCall { client.get("${EXAM_SESSIONS}/users/search"){parameter("q",q)} }
}
```

## ExamRepository.kt
- Constructor thêm `private val sessions: ExamSessionApiService`.
- Sửa `examRooms()` → trả `ExamRoomListResponse`; `examRoomSessions(roomId,page,limit)` → `ExamRoomSessionsResponse`.
- Thêm: `createExamRoom`, `deleteExamRoom`, `createExamSession`, `deleteExamSession`, `availableLabels`, `searchUsers`.

## AndroidAppContainer.kt
```kotlin
examRepository = ExamRepository(
  quizSets = QuizSetApiService(httpClient),
  rooms = ExamRoomApiService(httpClient),
  sessions = ExamSessionApiService(httpClient),   // mới
  attempts = ExamAttemptApiService(httpClient),
  decryptor = QuizDecryptor(MobileApiConfig.quizAesKey),
)
```

## Todo
- [x] Viết lại ExamRoomModels.kt
- [x] Cập nhật ExamRoomApiService.kt
- [x] Tạo ExamSessionApiService.kt
- [x] Cập nhật ExamRepository.kt (methods + constructor)
- [x] Cập nhật AndroidAppContainer.kt
- [x] `./gradlew :shared:compileDebugKotlinAndroid` (hoặc build android) pass

## Success criteria
Compile shared + android không lỗi; các method mới sẵn sàng cho VM.

## Rủi ro
- Field `_count` cần `@SerialName`. `assessType` trên session có thể là int → giữ Int.
