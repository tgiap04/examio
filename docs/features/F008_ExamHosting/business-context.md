# Business Context — F008_ExamHosting

## Why It Matters

Teachers need a structured way to schedule and proctor exams for their students. A quiz set alone is just a question bank — ExamHosting turns it into a time-bound, access-controlled, and monitored examination event. The analytics layer gives teachers visibility into student performance and integrity violations, enabling them to act on results rather than just collect scores.

## Who Uses It

- **Teacher (exam host)** — Creates exam rooms linked to their quiz sets, schedules sessions with specific time windows, configures access control (public for open exams, or private with an access code for targeted cohorts), monitors the leaderboard and cheating statistics during and after the session, and reviews individual student attempt details.
- **Student (exam taker)** — Browses available exam sessions on My Exams, enters a session with an access code if required, starts or resumes an exam attempt, and reviews their attempt history and scores.

## What They Do

1. Teacher opens My Materials and clicks "Create Exam Room", linking it to one of their existing quiz sets. They are taken to the room detail page.
2. Teacher creates a session within the room, setting a title, start/end time window, time limit, maximum attempts per student, and how questions are selected (all questions, random subset, or random by chapter).
3. Teacher configures sharing settings — setting the session to private with a 6-digit access code and copying the shareable link to send to students.
4. Students open My Exams, find the session, enter the access code if prompted, and click "Start Exam". They answer questions in fullscreen mode while the system monitors for tab switches and window blurs.
5. Students submit manually or the timer auto-submits when time expires. Both the student and teacher see the final score.
6. Teacher opens the session analytics page to see the score distribution chart, identify which students triggered the most integrity violations, and drill into individual attempt details.

## Unresolved Questions

- **Score display format**: Is the score shown as a percentage, a fraction (e.g., "8/10"), or a letter grade?
- **Attempt retake policy**: Can a student retake an exam after passing? Is there a cooldown period between attempts?
- **Integrity violation consequences**: Are students penalized for cheating violations, or is the log purely informational?
