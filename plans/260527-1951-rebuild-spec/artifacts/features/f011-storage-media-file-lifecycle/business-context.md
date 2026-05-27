# F011 - Storage, Media & File Lifecycle Business Context

## Why It Matters
Examio depends on uploaded files for AI generation, tutor knowledge, chat context, OCR, history, and profile personalization. A reliable storage lifecycle keeps user files available when needed and removes them when no longer owned or referenced.

## Who Uses It
Users upload documents and images. AI and OCR services process files behind the scenes. Profile, AI tool, history, and knowledge-management screens all depend on stored file metadata.

## What They Do
A user chooses a file or image, uploads it, and later sees it in a relevant flow such as recent uploads, generated history, AI chat, profile media, or knowledge management. When a file is deleted, the system should remove both the database record and the remote object when applicable.

## Known Limits
Exact R2 HTTP proxy route coverage, old media cleanup, delete ordering, OCR retry behavior, and R2 deletion on database record deletion all Need verification.
