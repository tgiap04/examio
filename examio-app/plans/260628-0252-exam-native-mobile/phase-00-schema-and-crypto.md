# Phase 00 — Shared: Fix Schema + AES-CBC Decrypt

**Priority:** Critical — blocks all other phases  
**Status:** pending

## Overview

Fix `SecureQuestion` model (KMP schema sai so với server thật) và implement AES-256-CBC decrypt
trong shared KMP module dùng `expect/actual` pattern.

## Context

FE (`examio-fe/src/lib/crypto.ts`) dùng:
- Algorithm: AES-256-CBC, PKCS7 padding
- Key: 32-byte string từ env `VITE_QUIZ_AES_KEY`
- Format ciphertext: `"ivBase64.ciphertextBase64"` (split by `.`)

Server trả `SecureQuestion`:
```json
{ "index": 0, "token": "<JWT>", "question_encrypted": "ivB64.dataB64", "options_encrypted": "ivB64.dataB64" }
```

KMP hiện tại (sai):
```kotlin
data class SecureQuestion(val id: String, val encryptedPayload: String, val iv: String?)
```

Submit answer dùng:
```json
{ "token": "<JWT per-question>", "chosen_option": "A" }
```

## Implementation Steps

### 1. Fix `ExamAttemptModels.kt`

File: `shared/src/commonMain/kotlin/com/examio/app/features/exams/models/ExamAttemptModels.kt`

```kotlin
// Thay SecureQuestion:
@Serializable
data class SecureQuestion(
    val index: Int,
    val token: String,
    val question_encrypted: String,
    val options_encrypted: String,
)

// Thay SecureAnswer:
@Serializable
data class SecureAnswer(
    val token: String,
    val chosen_option: String,
)

// Thêm DecryptedQuestion (local UI model, không serialize):
data class DecryptedQuestion(
    val index: Int,
    val token: String,
    val question: String,
    val options: List<String>,   // shuffled (seed = index)
    val optionKeys: List<String>, // A/B/C/D sau shuffle
)

// SecureQuizResponse cần update fields theo FE:
@Serializable
data class SecureQuizResponse(
    val attemptId: String,
    val status: Int,
    val currentIndex: Int = 0,
    val answers: Map<String, String> = emptyMap(), // questionIndex -> chosenOption
    val markedQuestions: List<String> = emptyList(),
    val totalQuestions: Int,
    val timeLimitMinutes: Int? = null,
    val startedAt: String,
    val questions: List<SecureQuestion>,
)

// SubmitExamAttemptRequest thay đổi — dùng SecureAnswer:
@Serializable
data class SubmitExamAttemptRequest(
    val answers: List<SecureAnswer>,
)
```

### 2. Tạo `QuizCryptoService` (expect/actual)

**File commonMain:** `shared/src/commonMain/kotlin/com/examio/app/features/exams/crypto/QuizCryptoService.kt`

```kotlin
package com.examio.app.features.exams.crypto

expect object QuizCryptoService {
    /** Decrypt "ivBase64.ciphertextBase64" với AES-256-CBC PKCS7 */
    fun decryptContent(ciphertext: String, key: String): String

    /** Decrypt options — parse JSON array sau decrypt */
    fun decryptOptions(ciphertext: String, key: String): List<String>
}
```

**File androidMain:** `shared/src/androidMain/kotlin/com/examio/app/features/exams/crypto/QuizCryptoService.android.kt`

```kotlin
actual object QuizCryptoService {
    actual fun decryptContent(ciphertext: String, key: String): String {
        val parts = ciphertext.split(".")
        val iv = Base64.decode(parts[0], Base64.DEFAULT)
        val data = Base64.decode(parts[1], Base64.DEFAULT)
        val keyBytes = key.padEnd(32, '!').take(32).toByteArray(Charsets.UTF_8)
        val secretKey = SecretKeySpec(keyBytes, "AES")
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(Cipher.DECRYPT_MODE, secretKey, IvParameterSpec(iv))
        return cipher.doFinal(data).toString(Charsets.UTF_8)
    }

    actual fun decryptOptions(ciphertext: String, key: String): List<String> {
        val json = decryptContent(ciphertext, key)
        return Json.decodeFromString(json)
    }
}
```

**File iosMain:** `shared/src/iosMain/kotlin/com/examio/app/features/exams/crypto/QuizCryptoService.ios.kt`

```kotlin
actual object QuizCryptoService {
    actual fun decryptContent(ciphertext: String, key: String): String {
        val parts = ciphertext.split(".")
        val iv = NSData.create(base64EncodedString = parts[0], options = 0u)!!
        val data = NSData.create(base64EncodedString = parts[1], options = 0u)!!
        val keyBytes = key.padEnd(32, '!').take(32).encodeToByteArray()
        // CommonCrypto via platform interop
        val keyData = keyBytes.toNSData()
        return aesCBCDecrypt(data, keyData, iv)
    }
    // aesCBCDecrypt: wrapper CommonCrypto kCCAlgorithmAES + kCCOptionPKCS7Padding
    actual fun decryptOptions(ciphertext: String, key: String): List<String> {
        val json = decryptContent(ciphertext, key)
        return Json.decodeFromString(json)
    }
}
```

### 3. Thêm `QUIZ_AES_KEY` vào config

**Android:** `androidApp/src/main/kotlin/com/examio/app/core/config/MobileApiConfig.kt`
```kotlin
val quizAesKey: String = BuildConfig.QUIZ_AES_KEY  // thêm vào build.gradle
```

**iOS:** `iosApp/ExamioApp/Core/Config/AppConfig.swift`
```swift
static let quizAesKey: String = Bundle.main.infoDictionary?["QUIZ_AES_KEY"] as? String ?? ""
```

**Android `build.gradle`:** thêm `buildConfigField("String", "QUIZ_AES_KEY", "\"${localProperties['QUIZ_AES_KEY']}\"")` và thêm key vào `local.properties`.

### 4. Thêm `decrypt()` helper vào ExamRepository

`ExamRepository.decryptQuiz(quiz: SecureQuizResponse, key: String): List<DecryptedQuestion>`

Shuffle options với seed = `question.index` để reproducible khi navigate back.

### 5. Update `ExamAttemptApiService.submit()`

Method signature thay đổi: `submit(attemptId, request: SubmitExamAttemptRequest)` với `answers: List<SecureAnswer>`.

## Related Files

- `shared/src/commonMain/.../exams/models/ExamAttemptModels.kt` — sửa
- `shared/src/commonMain/.../exams/crypto/QuizCryptoService.kt` — tạo mới
- `shared/src/androidMain/.../exams/crypto/QuizCryptoService.android.kt` — tạo mới
- `shared/src/iosMain/.../exams/crypto/QuizCryptoService.ios.kt` — tạo mới
- `shared/src/commonMain/.../exams/repository/ExamRepository.kt` — sửa
- `androidApp/.../core/config/MobileApiConfig.kt` — sửa
- `androidApp/.../build.gradle` — sửa (thêm buildConfigField)
- `iosApp/.../Core/Config/AppConfig.swift` — sửa

## Todo

- [ ] Fix SecureQuestion + SecureAnswer + SecureQuizResponse fields
- [ ] Thêm `DecryptedQuestion` data class
- [ ] Tạo `QuizCryptoService` expect/actual (commonMain + androidMain + iosMain)
- [ ] Thêm `QUIZ_AES_KEY` vào `MobileApiConfig` và iOS AppConfig
- [ ] Wire key vào `build.gradle` (Android), `Info.plist` / build script (iOS)
- [ ] Thêm `decryptQuiz()` helper vào ExamRepository
- [ ] Build verify cả Android + iOS

## Success Criteria

- Build xanh cả 2 platform
- Decrypt cho ra text đúng khi dùng test vector từ `examio-fe/src/lib/crypto.ts`
- `ExamAttemptApiService.submit()` nhận `List<SecureAnswer>` với `token + chosen_option`

## Risk

- iOS CommonCrypto interop qua Kotlin/Native cần thêm `platform.Security` hoặc `CryptoKit` — kiểm tra availability trên iOS 16+
- Thay đổi schema sẽ làm fail nếu có code cũ còn dùng `encryptedPayload` — grep toàn bộ trước khi sửa
