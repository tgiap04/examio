# F002 - Account Verification & Profile Security Business Context

This feature helps users trust and control their accounts after they sign in. It covers email verification, profile personalization, profile media, and device/session security.

Verification gives Examio a way to distinguish confirmed accounts from accounts that have not proven ownership of their email address. The workspace can guide users to verify when needed.

Profile management lets users keep their name, avatar, banner, and other personal details up to date. Media uploads are backed by the storage service, so profile images can be reused consistently across clients.

Device management helps users see where they are signed in and remove sessions they no longer trust. This is important when a user signs in from a shared or lost device.

Mobile account screens exist, but the artifacts say most non-auth mobile account details are still mock-backed or need wiring verification.

## Artifact References
- `feature-list.md` F002
- `user-stories.md` US004, US015
- `permissions.md` PERM009-PERM011
