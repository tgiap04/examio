# F009 - Exam Taking, Attempts & Integrity Logging Screens

## Screen List
- SCR031 `/exam-session/:id` - Exam Session Entry: standalone entry screen that verifies code/link/access before quiz access.
- SCR032 `/exam-session/:id/quiz` - Exam Quiz: standalone secure quiz and proctoring flow.
- SCR210 MyExamsView - iOS mock-backed exam attempts/detail/quiz/result states; production API wiring Needs verification.
- Android mobile My Exams/Quiz screens - referenced by FeatureList as mobile quiz/result states; exact SCR codes Need verification from mobile screen inventory.

## User Journey
1. Student opens an exam session link or enters through the exam session route.
2. System checks authentication status — unauthenticated users are redirected to `/login?from=...` with the return path preserved.
3. System loads session details and checks whether the student can join.
4. Student starts or resumes the attempt and receives quiz content.
5. Student answers questions, moves between questions, marks items, and progress is saved.
6. Proctoring events are logged when suspicious browser behavior is detected.
7. Student submits the exam and sees result/history according to available attempt data.

## Artifact References
- `screen-list.md` SCR031, SCR032, SCR210.
- `screen-flow.md` FLW033, FLW034.
- `feature-list.md` F009.
