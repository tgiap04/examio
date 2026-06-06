# F012 - Cross-Platform Mobile Companion Business Context

## Why It Matters
The mobile companion makes Examio available beyond the web app. It helps users sign in, browse core learning areas, and continue important workflows from Android and iOS devices.

## Who Uses It
Mobile students and teachers use it to access Examio on phones. Product and engineering teams use it as the foundation for bringing web-backed learning, exam, AI, wallet, and account workflows into native experiences.

## What They Do
A mobile user signs in, lands in a tab-based app, and moves between home, AI, study, exams, history, account, wallet, and teacher areas. Auth is real, while many feature screens currently demonstrate the intended experience with local sample state until production repository wiring is completed.

## Known Limits
Most non-auth mobile screens are mock-backed. Mobile AI streaming is not implemented. iOS uses a separate auth client rather than shared KMP token storage. Non-auth deep links and full DTO parity Need verification.
