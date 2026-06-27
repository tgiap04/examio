# Consultation Report: Native Exam/Flashcard/CRUD trên Mobile

**Date:** 2026-06-28  
**Advisor:** CTO lens  
**Scope:** Android + iOS (examio-app KMP)

---

## Commission

User muốn làm thi, học, sửa câu hỏi, sửa flashcard **hoàn toàn native** trong mobile app, không phải lên browser.

---

## Tình trạng hiện tại (khảo sát)

| Flow | Trạng thái |
|---|---|
| List exam attempts | Có — cả 2 platform |
| Exam attempt detail | Có — nhưng chỉ show điểm + text "lên examio.vn" |
| **Thi native (exam-taking)** | **Chưa có** — API đã wired, thiếu UI |
| Flashcard study (flip) | Có native cả 2 platform |
| Flashcard study modes | Chưa có |
| CRUD quiz questions | Chưa có UI — API đã wired |
| CRUD flashcard cards | Chưa có UI — API đã wired |
| Browser redirect code | **Không có** — chỉ là text hint "vào examio.vn" |

---

## Phát hiện kỹ thuật quan trọng

### 1. SecureQuestion schema sai
KMP shared model hiện có: `encryptedPayload + iv` → **Sai**  
Server thật trả: `{ index, token, question_encrypted, options_encrypted }`

### 2. AES-256-CBC decrypt cần implement
- FE dùng `crypto-js`: format `"ivBase64.ciphertextBase64"`, key 32 bytes từ env `QUIZ_AES_KEY`
- KMP cần `expect/actual` pattern:
  - Android: `javax.crypto.Cipher` AES/CBC/PKCS5Padding
  - iOS: CommonCrypto kCCAlgorithmAES

### 3. Submit dùng token per-question
```kotlin
data class SecureAnswer(val token: String, val chosen_option: String)
```
Không dùng questionId — mỗi câu có JWT token riêng.

### 4. Shuffle chỉ options (không shuffle câu hỏi)
```kotlin
val shuffledOptions = question.options.shuffled(Random(seed = question.index))
// seed cố định để nav back không đổi thứ tự
```

---

## Quyết định đã xác nhận

- Timer countdown: Có (hiển thị từ `timeLimitMinutes` + `startedAt`, ẩn nếu null)
- Post-submit review: Có (nếu `showAnswers=true` từ server)
- AES key: Hardcode trong `MobileApiConfig` (tương đương FE env)

---

## Agreed direction: Path B (song song theo track)

```
Phase 0: Fix SecureQuestion schema + AES-CBC decrypt (shared commonMain + expect/actual)
Phase 1A: Exam-taking screen (Android + iOS) — start, decrypt, timer, submit
Phase 1B: CRUD quiz questions (Android + iOS) — list + FAB add + edit/delete
Phase 1C: CRUD flashcard cards (Android + iOS) — list + FAB add + edit/delete
Phase 2A: Post-submit review screen (đáp án đúng/sai)
Phase 2B: Flashcard study modes (chỉ sai, ngẫu nhiên)
```

Track 1A/1B/1C song song. Phase 2 sau khi Phase 1 complete.

---

## Rủi ro

| Rủi ro | Mức | Mitigation |
|---|---|---|
| AES expect/actual khác kết quả Android vs iOS | Trung bình | Test vector từ FE crypto.ts |
| Timer drift khi app background | Thấp | Tính từ `startedAt` server, không local clock |
| Schema lệch thêm endpoint khác | Thấp | Verify từng endpoint trước khi dùng |

---

## Unresolved questions
- None
