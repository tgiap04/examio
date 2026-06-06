# F003 - Workspace Navigation, Dashboard & Material Access Screens

## Screen List
- SCR012 `/k` - Workspace root redirect; exact destination Needs verification.
- REG003 KLayout - Authenticated shell with sidebar/header/search/theme/verification banner/pending job dialog.
- SCR016 `/k/my-materials` - Recent student materials.
- SCR018 `/k/history` - History overview.
- SCR019 `/k/history/exam` - Exam history.
- SCR020 `/k/history/pdf` - PDF/upload/generation history.
- SCR107 Android HomeScreen - Mock-backed, unused in main tab selection.
- SCR112 Android StudyScreen - Mock-backed materials/study UI.
- SCR113 Android LichSuScreen - Mock-backed history UI.
- SCR207 iOS HomeView - Mock-backed dashboard/default stats.
- SCR209 iOS StudyView - Mock-backed material/study UI.

## User Journey
1. Authenticated user lands on `/k`; the app resolves the workspace destination. Exact route Needs verification.
2. KLayout renders shared navigation and workspace utilities.
3. User opens My Materials to see recent exams/flashcards and pinned/shared content.
4. User selects a material to continue study, open flashcard study, or reach an exam-related destination. Exact navigation from materials Needs verification.
5. User opens History to review summary stats and recent activity.
6. User branches into exam history or PDF history for focused lists.
7. On mobile, user can navigate similar tabs, but displayed data is mostly mock-backed outside auth.

## Artifact References
- `screen-list.md` SCR012, SCR016, SCR018-SCR020, REG003, SCR107, SCR112-SCR113, SCR207, SCR209
- `screen-flow.md` FLW010-FLW012, FLW023, FLW041, FLW053, FLW105, FLW108, FLW205
