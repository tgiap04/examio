# Phase 01 — Shared: study-session API + models

**Priority:** Cao (chặn phase 02) · **Status:** ✅ DONE

## Files
**Sửa:**
- `shared/.../features/exams/models/ExamRoomModels.kt` — thêm model study-session
- `shared/.../features/exams/api/ExamSessionApiService.kt` — thêm checkAccess/publicInfo/verifyCode
- `shared/.../features/exams/repository/ExamRepository.kt` — thêm methods

## Models thêm (ExamRoomModels.kt)
```kotlin
@Serializable data class SessionAccessCheck(
    val hasAccess: Boolean = false,
    val accessType: String = "denied",   // public/owner/whitelist/code_required/denied
    val requiresCode: Boolean = false,
)
@Serializable data class SessionCreator(val id: String, val username: String? = null, val name: String? = null, val avatar: String? = null)
@Serializable data class SessionPublicInfo(
    val id: String, val title: String = "", val description: String? = null,
    val startTime: String? = null, val endTime: String? = null, val status: Int = 0,
    val isPublic: Boolean = false, val requiresCode: Boolean = false,
    val creator: SessionCreator? = null,
)
@Serializable data class VerifyCodeRequest(val accessCode: String)
@Serializable data class VerifyCodeResponse(val valid: Boolean = false, val message: String? = null)
```

## ExamSessionApiService.kt thêm
```kotlin
suspend fun checkAccess(id): ApiResult<SessionAccessCheck> = safeApiCall { client.get("${EXAM_SESSIONS}/study/$id/access") }
suspend fun publicInfo(id): ApiResult<SessionPublicInfo> = safeApiCall { client.get("${EXAM_SESSIONS}/study/$id/info") }
suspend fun verifyCode(id, code): ApiResult<VerifyCodeResponse> =
    safeApiCall { client.post("${EXAM_SESSIONS}/study/$id/verify-code") { setBody(VerifyCodeRequest(code)) } }
```

## ExamRepository.kt thêm
```kotlin
suspend fun sessionAccess(id) = sessions.checkAccess(id)
suspend fun sessionInfo(id) = sessions.publicInfo(id)
suspend fun verifySessionCode(id, code) = sessions.verifyCode(id, code)
```

## Todo
- [x] Thêm models
- [x] Thêm 3 method API
- [x] Thêm 3 method repository
- [x] Compile shared+android pass

## Success criteria
Compile không lỗi; VM landing gọi được checkAccess/info/verifyCode.
