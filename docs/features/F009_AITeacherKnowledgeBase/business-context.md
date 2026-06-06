# Business Context — F009_AITeacherKnowledgeBase

## Why It Matters

The AI tutor's usefulness is directly tied to the quality and breadth of its knowledge base. Without uploaded documents, the AI can only answer from its general training data. AITeacherKnowledgeBase lets users ground the AI tutor in their own course materials, lecture notes, past exams, and reference documents — turning a generic AI into a subject-matter expert for their specific curriculum.

## Who Uses It

- **Teacher (knowledge curator)** — Uploads lecture slides, textbooks, and reference documents to build a domain-specific knowledge base. Organizes files into folders by subject or course. Reprocesses files when source material is updated. Monitors knowledge base statistics to understand coverage gaps.
- **Student (knowledge consumer)** — Benefits indirectly: the AI tutor uses the knowledge base to answer questions grounded in the course materials rather than generic knowledge.

## What They Do

1. User navigates to the GenAI Knowledge page and opens the FolderPanel to create folders organized by subject or course.
2. User switches to the FilePanel, selects one or more documents (PDF, DOC, or TXT), and uploads them. Each file enters a processing queue and the user watches the status badge transition from "Pending" to "Processing" to "Ready".
3. Once files are ready, the user can reprocess them if the source document was updated — the AI service regenerates chunks and embeddings.
4. For bulk content, the user opens the Dataset Import panel and submits a structured dataset file. A background job processes it and adds the content to the knowledge base.
5. The user monitors the StatsPanel to see how many files, chunks, and graph nodes make up their knowledge base — tracking coverage as they add more material.

## Unresolved Questions

- **Knowledge base sharing**: Can a teacher share their knowledge base with specific students, or is it purely personal to the uploader?
- **Knowledge base export**: Can users export their processed chunks or graph for backup or transfer?
- **Recommended file formats**: Are there file formats that produce better AI quality — for example, does a plain text file produce more reliable chunks than a scanned PDF?
