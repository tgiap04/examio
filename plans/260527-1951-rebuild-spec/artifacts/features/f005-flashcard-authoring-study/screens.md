# F005 Screens - Flashcard Authoring & Study

## Screen List
- SCR017 `/k/flash-card` - browse/search/create flashcard sets.
- SCR023 `/k/manage-flashcard-set/:id` - edit a set, cards, labels, and sharing.
- SCR030 `/study-flashcard/:id` - standalone flashcard study flow; no web route guard, API access required.
- SCR016 `/k/my-materials` - recent materials can link to flashcard study.
- SCR112 Android StudyScreen - mock-backed study/material list.
- SCR209 iOS StudyView - mock-backed material list and flashcard study.

## User Journey
1. User opens the workspace flashcard page.
2. User creates or selects a flashcard set.
3. User edits title/tags/cards/labels and sharing settings where permitted.
4. User starts study from the set, My Materials, or a shared link.
5. The study screen loads accessible cards and submits progress/answers.
6. User returns to materials/history with updated progress where supported; exact history display Needs verification.

Artifact refs: `screen-list.md` SCR016, SCR017, SCR023, SCR030, SCR112, SCR209; `screen-flow.md` FLW021-FLW023.
