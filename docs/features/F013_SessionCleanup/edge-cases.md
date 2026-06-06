# Edge Cases — F013_SessionCleanup

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| Session has expired (`expiresAt < now`) on cron run | Session is hard-deleted from the database | None — system maintenance |
| Session inactive for 30+ days (`lastActivity < now - 30d`) | Session is set to `isActive = false` | None — system maintenance |
| Session older than 90 days | Session is hard-deleted regardless of `isActive` | None — system maintenance |
| Session has `expiresAt` in the future | No action taken | None |
| Session is already `isActive = false` | First pass skips it (only targets `isActive = true`); third pass may delete it if `createdAt` is old enough | None |
| Database connection failure during cron | Error is caught and logged to console; job stops for this run | Console error logged |
| Cleanup step 1 fails | Steps 2 and 3 still run (sequential, non-atomic) | Console error logged |
| No sessions match any criteria | Each step reports 0 affected sessions | None |
