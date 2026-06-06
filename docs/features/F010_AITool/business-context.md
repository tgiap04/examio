# Business Context — F010_AITool

## Why It Matters

Manually authoring quiz questions and flashcards from scratch is time-consuming and repetitive — especially for teachers managing multiple courses. AITool removes this friction by letting users upload their lecture notes, textbooks, or reference documents and have AI generate ready-to-use quiz questions and flashcards in minutes. This dramatically lowers the barrier to creating quality study materials and keeps users engaged on the platform rather than exporting to third-party tools.

## Who Uses It

- **Teacher (content creator)** — Uploads their course materials and generates practice quizzes and flashcard decks for students to use in study sessions or exam preparation. Monitors generation job status and can cancel a wrong request.
- **Student (self-study)** — Uploads their own notes and generates personalized study materials. Can retry generation if initial results are unsatisfactory.

## What They Do

1. User navigates to the AI Tool page and sees a list of their previously uploaded documents, each with a status badge.
2. User selects a document that shows "Ready" and chooses whether to generate a quiz or flashcards. They configure generation parameters (number of questions, difficulty level).
3. User clicks Generate. The system checks their credit balance — if sufficient, a background job is queued. A progress dialog appears showing real-time status as the AI service processes the document.
4. When generation completes, the user sees the result summary — for example, "15 quiz questions generated" or "30 flashcards created" — and can review the output before saving it to their materials.
5. If the user closes the tab during an active job, they return to the AI Tool page and the progress dialog reappears automatically, continuing to poll until the job finishes or the user cancels.

## Unresolved Questions

- **Generation quality feedback**: Can users rate or flag generated content as incorrect, which would improve future generations?
- **Generated content ownership**: Who owns the AI-generated questions and flashcards — the document uploader, the user who initiated generation, or the platform?