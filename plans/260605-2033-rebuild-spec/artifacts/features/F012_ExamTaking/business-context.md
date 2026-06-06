# Business Context — F012_ExamTaking

## Why It Matters

The exam-taking feature is the core high-stakes interaction on the platform. Students must be able to take exams with confidence that their answers are preserved, their time is respected, and their results are accurate. Encryption of questions and answers prevents answer leakage. Cheating detection protects the integrity of the platform's assessments.

## Who Uses It

- **Student** — takes timed exams, answers questions, navigates between questions, marks items for review, and receives a final score.
- **Teacher** — sets up exam sessions with time limits and access controls; views analytics on student performance after sessions end.

## What They Do

1. Student navigates to an exam session and clicks Start or Resume.
2. The system fetches the exam attempt and decrypts the questions on the client side.
3. A timer starts counting down from the session's time limit.
4. Student reads each question, selects an answer, and navigates to the next question.
5. The system automatically saves the student's progress every 30 seconds in the background.
6. The system monitors for suspicious browser behavior such as tab switches and logs violations.
7. When the student submits or the timer expires, the system sends the encrypted answers to the server for grading.
8. The system displays the final score, pass/fail status, and a breakdown of correct and incorrect answers.
9. If the teacher enabled answer review, the student can click through each question to see their answer versus the correct answer.

## Unresolved Questions

- **Auto-submit fallback**: If the student loses internet mid-exam and `sendBeacon` fails, does the server auto-submit the attempt based on a server-side time check?
- **Cheating log visibility**: Are cheating logs visible to the student after the exam, or only to the teacher?