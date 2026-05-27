# F009 - Exam Taking, Attempts & Integrity Logging Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Invalid or expired session access | API/session/code check rejects entry before quiz route is usable. | Unable to access this exam session. |
| Attempt already exists | System resumes saved progress where supported. Exact conflict rules Need verification. | Resuming your previous attempt. |
| Retake not allowed | Attempt start is blocked by session retake rules. | You cannot retake this exam. |
| Secure quiz payload cannot be decrypted | Quiz cannot render; user should retry or contact support. Exact behavior Needs verification. | We could not load the secure quiz. Please try again. |
| Network loss during answer save | Local UI may keep current answer, but persistence result Needs verification. | Connection lost. Your latest answer may not be saved. |
| Proctoring violation detected | Cheating log is sent and violation count may update. Penalty thresholds Need verification. | Suspicious activity was detected and recorded. |
| Cheating log route mismatch | Singular/plural API mismatch may fail logging until route is verified. | We could not record the integrity event. |
| Submit after session ended | Backend should reject or mark late submission according to session policy; exact behavior Needs verification. | This exam session is no longer accepting submissions. |
