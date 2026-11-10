# Business Context — F006_QuizAuthoring

## Why It Matters

Teachers need to build and maintain quiz question banks efficiently. Without a structured authoring workflow, questions accumulate in scattered documents with no versioning, labeling, or reuse. AI-assisted generation from uploaded documents dramatically reduces the manual effort of question creation, making it realistic for teachers to maintain large, well-organized question banks for diverse student cohorts.

## Who Uses It

- **Teacher (quiz author)** — Creates quiz sets, adds questions manually or generates them via AI from their uploaded lecture notes and textbooks. Organizes questions with chapter labels. Publishes sets for students to use in exam sessions.
- **Student (content consumer)** — Uploads their own documents to generate study flashcards and quiz questions. Tracks which PDFs have been processed and can regenerate content if initial results were poor.

## What They Do

1. Teacher opens My Materials and clicks "Create Quiz Set", entering a title, description, and privacy setting.
2. Teacher is taken to the quiz set detail page and adds questions one by one — entering the question text, providing 4 answer options, and marking the correct one. They optionally add chapter labels to tag questions by topic.
3. Alternatively, teacher uploads a PDF or document, waits for it to finish processing (status changes to "Ready"), then clicks "Generate Quiz via AI". The system queues a background job (no charge), and shows a progress dialog. Within minutes, generated questions appear in the set automatically.
4. Teacher previews the generated questions, edits or deletes any that are incorrect, then sets the quiz set to public so students can find it.
5. Teacher views their PDF upload history to re-download processed documents or delete records they no longer need.

## Unresolved Questions

- **Question authorship**: When AI generates questions from a shared document, who is listed as the question author — the uploader of the document or the teacher who initiated generation?
