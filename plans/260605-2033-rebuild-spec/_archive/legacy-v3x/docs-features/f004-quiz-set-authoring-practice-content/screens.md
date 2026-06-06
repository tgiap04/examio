# F004 - Quiz Set Authoring & Practice Content Screens

## Screen List
- SCR021 `/k/manage-exam` - Manage Exams / Quiz Sets list and CRUD entry.
- SCR022 `/k/manage-quiz-set/:id` - Quiz set detail with questions, labels, editor, and export.
- SCR024 `/k/ai-tool` - Generates quiz content from uploaded files; supports generated quiz history/result flow.
- SCR016 `/k/my-materials` - Can surface quiz/exam materials for student access.
- SCR111 Android DeThiScreen - Mock-backed exam set management/stats/create UI.
- SCR116 Android TeacherScreen - Mock-backed content management UI.
- SCR212 iOS TeacherView - Mock-backed teacher content management.

## User Journey
1. User opens Manage Exams / Quiz Sets.
2. User creates a quiz set or opens an existing one.
3. User edits title/metadata, adds questions, and organizes labels.
4. User saves changes; store cache invalidates so lists/details reload fresh data.
5. User may share/export/use the quiz set in later practice or exam workflows. Exact sharing/export behavior Needs verification.
6. User may generate quiz content from a file in AI Tool, then save/reuse it as quiz content. Exact conversion flow Needs verification.
7. Mobile users see similar quiz/teacher screens, but these are mock-backed unless repository wiring is verified.

## Artifact References
- `screen-list.md` SCR016, SCR021-SCR022, SCR024, SCR111, SCR116, SCR212
- `screen-flow.md` FLW020, FLW023, FLW040, FLW105, FLW108, FLW206
