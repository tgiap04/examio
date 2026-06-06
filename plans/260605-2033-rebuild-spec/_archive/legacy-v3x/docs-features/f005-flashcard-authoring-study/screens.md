# F005 Screens - Flashcard Authoring & Study

## Screen List
- SCR017 `/k/flash-card` - browse/search/create flashcard sets.
- SCR023 `/k/manage-flashcard-set/:id` - edit a set, cards, labels, and sharing.
- SCR030 `/study-flashcard/:id` - standalone flashcard study flow; no web route guard, but the page now includes an auth check that redirects unauthenticated users to `/login?from=...`. API access is the secondary enforcement point.
- SCR016 `/k/my-materials` - recent materials can link to flashcard study.
- SCR112 Android StudyScreen - mock-backed study/material list.
- SCR209 iOS StudyView - mock-backed material list and flashcard study.

## User Journey
1. User opens the workspace flashcard page.
2. User creates or selects a flashcard set.
3. User edits title/tags/cards/labels and sharing settings where permitted.
4. In the label management UI, user can now click an eye icon to view a flashcard's full content in `ViewFlashcardDialog` without navigating away from the label view.
5. User starts study from the set, My Materials, or a shared link.
6. If not authenticated, the study page redirects to `/login?from=...` preserving the return path.
7. The study screen loads accessible cards and submits progress/answers.
8. User returns to materials/history with updated progress where supported; exact history display Needs verification.

Artifact refs: `screen-list.md` SCR016, SCR017, SCR023, SCR030, SCR112, SCR209; `screen-flow.md` FLW021-FLW023.
