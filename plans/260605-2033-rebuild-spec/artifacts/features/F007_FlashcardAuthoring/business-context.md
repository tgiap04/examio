# Business Context — F007_FlashcardAuthoring

## Why It Matters

Teachers need to build and maintain flashcard decks for students to study. Without a structured authoring tool, teachers fall back on third-party apps with no integration to the platform. FlashcardAuthoring keeps content creation within kmaedu, enabling AI-assisted generation from lecture notes and textbooks, and ensuring that decks are discoverable on the platform alongside quiz sets and exam rooms.

## Who Uses It

- **Teacher (flashcard author)** — Creates flashcard decks, adds cards manually or generates them via AI from uploaded documents. Organizes cards with chapter labels. Sets visibility to public so students can discover them, or private with an access code for targeted cohorts.
- **Student (content consumer)** — Browses public flashcard sets on the FlashcardsPage, enters an access code for protected decks, and studies using the interactive flip interface.

## What They Do

1. Teacher navigates to My Materials and clicks "Create Flashcard Set", entering a title, description, and privacy setting.
2. Teacher is taken to the flashcard set detail page and adds cards — entering the front (question) and back (answer) text. They optionally add chapter labels to organize cards by topic.
3. Alternatively, teacher uploads a document, waits for it to finish processing, then launches AI flashcard generation. Credits are deducted (or bypassed in free mode), a background job starts, and generated cards appear in the deck when complete.
4. Teacher saves and sets the deck to public so students can find it, or keeps it private with an access code for a specific group.
5. Students browse the FlashcardsPage, find a public deck, and begin studying with the flip-card interface.

## Unresolved Questions

- **Study progress on deck deletion**: If a teacher deletes a deck that students have been studying, are individual card progress records preserved or removed?
- **Generated card authorship**: When AI creates flashcards from a document, who is listed as the card author — the document uploader or the teacher who initiated generation?
