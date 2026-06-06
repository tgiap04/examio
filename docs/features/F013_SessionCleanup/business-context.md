# Business Context — F013_SessionCleanup

## Why It Matters

Inactive and expired sessions accumulate over time in the database. Left uncleansed, they consume storage, inflate auth middleware lookups, and present a security surface — old sessions may still hold valid tokens if their expiry timestamps were not properly enforced. A nightly cleanup job keeps the session table lean and ensures expired sessions cannot be used to access the platform.

## Who Uses It

- **Platform (system)** — runs the cron job to maintain database hygiene and session security.
- **End users** — benefit indirectly: stale sessions from old devices are removed, reducing the surface for unauthorized access.

## What They Do

1. The cron scheduler fires at 3:00 AM server time.
2. The cleanup job queries for sessions with `expiresAt` in the past and deletes them.
3. The job then queries for sessions where `lastActivity` is more than 30 days ago and sets `isActive = false`.
4. Finally, the job deletes any sessions older than 90 days regardless of their activity status.
5. Each step logs the number of sessions affected.

## Unresolved Questions

- **Cleanup frequency**: Is daily cleanup sufficient, or should sessions with very short TTL (e.g., 1-day) be cleaned up more frequently?
- **Batch size**: Are deletions processed in batches to avoid locking the `UserSession` table under heavy load?