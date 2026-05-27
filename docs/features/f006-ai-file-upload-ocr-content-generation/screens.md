# F006 Screens - AI File Upload, OCR & Content Generation

## Screen List
- SCR024 `/k/ai-tool` - upload, generation, recent files, job polling.
- SCR020 `/k/history/pdf` - upload/generation history.
- SCR018 `/k/history` - history overview entry point.
- SCR108 Android AiScreen - mock-backed AI sections.
- SCR109 Android AIToolScreen - mock-backed PDF upload/generation UI.
- SCR208 iOS AiView - mock-backed teacher/chat/tool/history segmented UI.

## User Journey
1. User opens AI Tool.
2. User uploads a file or image.
3. System stores the file and starts processing.
4. User waits while status/job polling updates the UI.
5. User chooses quiz or flashcard generation from the processed file.
6. Generated content is shown and saved to history where supported.
7. User revisits recent uploads or PDF/generation history.

Artifact refs: `screen-list.md` SCR018, SCR020, SCR024, SCR108, SCR109, SCR208; `screen-flow.md` FLW040-FLW041.
