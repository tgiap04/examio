# F008 Screens - Exam Room & Session Management

## Screen List
- SCR026 `/k/manage-exam-room` - exam room list and creation.
- SCR027 `/k/manage-exam-room/:id` - room detail and session list/configuration.
- SCR028 `/k/manage-exam-room/:id/session/:sessionId` - session analytics.
- SCR029 `/k/my-exams` - student available exams list, downstream entry to F009.
- SCR110 Android MyExamsScreen - mock-backed exam list/detail/quiz/result states.
- SCR111 Android DeThiScreen - mock-backed exam set management and stats.
- SCR116 Android TeacherScreen - mock-backed content management UI.
- SCR210 iOS MyExamsView - mock-backed attempts/detail/quiz/result states.
- SCR212 iOS TeacherView - mock-backed teacher content management.

## User Journey
1. Teacher opens Manage Exam Rooms.
2. Teacher creates or selects a room.
3. Teacher configures sessions with schedule, access, sharing, pass score, and retake settings.
4. Teacher starts or updates session status where allowed.
5. Students discover/join sessions through My Exams or standalone links; detailed taking flow is F009.
6. Teacher opens session analytics to review attempts and integrity logs.

Artifact refs: `screen-list.md` SCR026-SCR029, SCR110, SCR111, SCR116, SCR210, SCR212; `screen-flow.md` FLW030-FLW034.
