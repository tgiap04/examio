# Screens — F016_WordFamily

## Screen List

- SCR040: WordFamilyPage (category browse)
- SCR041: WordFamilyCategoryPage (root word list + generate)
- SCR042: WordFamilyDetailPage (word family detail, save, flashcard bridge)
- SCR043: AdminWordFamilyPage (admin category CRUD)

See `docs/generated/screen-list.md` for full component breakdowns.

## User Journey

**Student path:**
1. `WordFamilyPage` (SCR040) — browse active categories as cards.
2. `WordFamilyCategoryPage` (SCR041) — view root-word chips within a category; tap "Tạo thêm từ gốc" to generate more via AI.
3. `WordFamilyDetailPage` (SCR042) — view a word family in Tree or List view, select words, save to collection, or convert selection to a flashcard deck via `CreateFlashcardModal`.
4. On successful flashcard conversion, navigate to `/k/manage-flashcard-set/:id` to study the new deck.

**Admin path:**
1. `AdminWordFamilyPage` (SCR043) — manage the category catalog: create/edit via modal (with auto-slug generation from the Vietnamese name), soft-delete to retire a category.

See `business-context.md` § What They Do for the plain-language narrative.
