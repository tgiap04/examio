# F011 - Storage, Media & File Lifecycle Screens

## Screen List
- Profile avatar/banner upload screen - tied to profile management; exact SCR ref Needs verification from screen-list detail.
- AI upload flows - used by `/k/ai-tool` and AI generation flows; exact SCR refs Need verification.
- GenAI knowledge file manager - used by `/k/genai-knowledge`; exact SCR refs Need verification.
- History/recent uploads surfaces - show files or generated history linked to uploads; exact SCR refs Need verification.

## User Journey
1. User opens a profile, AI upload, chat, history, or knowledge-management surface.
2. User selects a file or image.
3. System uploads the content and records metadata.
4. The file becomes available for display, processing, generation, OCR, or knowledge use.
5. User or system may delete the file/record.
6. The associated remote R2 asset should be removed when no longer needed; implementation Needs verification.

## Artifact References
- `feature-list.md` F011.
- `user-stories.md` US008, US015, US018.
- `screen-flow.md` FLW050, plus AI upload/generation flows from F006; exact flow refs Need verification.
