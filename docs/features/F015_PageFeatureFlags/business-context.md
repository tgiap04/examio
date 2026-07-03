# Business Context — F015_PageFeatureFlags

## Why It Matters

When a page or feature isn't ready — buggy, incomplete, or needs to be pulled back after launch — the team previously had to redeploy code to hide it. That's slow and risky during an incident. Page Feature Flags let an admin flip a single switch and have that page disappear from every user's app within seconds, no deploy required. It also protects the platform's reputation: if something breaks in production, admins can hide it instead of leaving broken functionality visible to students and teachers.

## Who Uses It

- **Admin** — toggles pages on/off from a dedicated admin screen and sees the change take effect immediately for all users.
- **Students / Teachers** — never interact with this feature directly, but experience its effect: a hidden page simply doesn't appear in navigation, and visiting its URL shows a normal "not found" page rather than an error or broken screen.

## What They Do

1. An admin opens the Page Config screen and sees a list of every togglable page with its current on/off state.
2. The admin flips a switch to disable a page that's having issues.
3. The change is saved immediately, and the switch shows the new state right away (rolling back automatically if the save fails).
4. Within moments, every user currently on the platform stops seeing that page in their navigation menu — and if someone tries to visit it directly, they get a normal "not found" page instead of an error.
5. If the admin needs to reverse the change, they flip the switch back the same way.
6. Every toggle is recorded in the admin audit log with who made the change and when.

## Unresolved Questions

- Should non-admin roles (e.g. a "support" role) eventually be allowed to toggle a limited subset of pages, or should this always stay admin-only?
- Should there be a scheduled/automatic re-enable (e.g. "disable for the next 2 hours") instead of purely manual toggling?
