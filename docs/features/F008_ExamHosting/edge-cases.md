# Edge Cases — F008_ExamHosting

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| Student tries to start exam when session is UPCOMING | Start button is disabled; countdown to start is shown | "This exam has not started yet. It begins in [countdown]." |
| Student tries to start exam when session has ENDED | Start button is hidden; "Session ended" banner shown | "This exam session has ended." |
| Student tries to start when attempt limit is reached | HTTP 409 or 403; "Attempt limit reached" error shown | "You have reached the maximum number of attempts for this exam." |
| Student closes browser during active attempt | `sendBeacon` fires final auto-save on `beforeunload`; attempt remains IN_PROGRESS | None — silent; progress is saved |
| Tab switch or window blur during exam | `CheatingWarningModal` shown; violation logged; count incremented | "Tab switch detected. This violation has been logged." |
| Student submits exam after time expires | Server auto-submits with last saved progress | "Time expired — your exam has been submitted with your last saved answers." |
| Non-host tries to access exam room detail URL directly | Backend returns 403; UI shows access denied | "You do not have permission to view this exam room." |
| Room host tries to configure sharing for another host's session | 403 returned | "You do not have permission to modify this session." |
| Attempt limit reached for a PRIVATE session | Student sees access granted but cannot start; error shown | "You have reached the maximum number of attempts." |
| Room host deletes a session with in-progress attempts | Behavior unverified: blocked with 409 or cascades to cancel attempts | "Cannot delete session with active attempts." |
| Student enters incorrect access code 3 times | Error message shown each time; no lockout detected | "Incorrect access code. Please try again." |
| Question selection mode is RANDOM_TOTAL but linked QuizSet has fewer questions than requested | HTTP 400: "Not enough questions in the quiz set" | "The linked quiz set does not have enough questions for this selection mode." |
| Teacher sets session end time before start time | Validation error shown in form; API returns 400 | "End time must be after start time." |
| Student attempts to view another student's attempt | 403 returned; detail sheet not shown | "You do not have permission to view this attempt." |
| Student tries to resume an attempt that was CANCELLED | Resume button not shown; student must start a new attempt | "This attempt was cancelled. Please start a new attempt." |
