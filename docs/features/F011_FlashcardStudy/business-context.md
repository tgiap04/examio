# Business Context — F011_FlashcardStudy

## Why It Matters

Flashcard study is a core learning mechanism on the platform. Students need a frictionless, engaging study interface with progress tracking so they can review decks at their own pace and resume where they left off. Access control ensures private decks can be shared selectively via access codes.

## Who Uses It

- **Student** — studies flashcard decks to memorize content; wants progress tracked and study sessions resumable.
- **Deck owner** — shares a private deck by giving the access code to specific students.

## What They Do

1. Student navigates to a flashcard set URL.
2. System checks if the set is public, the student is the owner, or the student is on the whitelist — if so, the study interface loads directly.
3. If the set requires an access code, the student enters the 6-digit code; system validates it and unlocks the study interface.
4. Student flips through cards, navigates with keyboard or buttons, and toggles sound effects and shuffle.
5. On each card advance, the system saves the studied card ID to the student's progress record.
6. When the student returns, the system restores their progress, showing which cards have been studied.

## Unresolved Questions

- **Progress reset policy**: Does progress reset when the deck owner adds new cards, or does it persist indefinitely?
- **Access code security**: Is there brute-force protection on access code attempts?
