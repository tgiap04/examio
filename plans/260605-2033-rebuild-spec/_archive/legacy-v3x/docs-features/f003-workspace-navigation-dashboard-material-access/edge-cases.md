# F003 - Workspace Navigation, Dashboard & Material Access Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Unauthenticated user opens `/k/my-materials` | ProtectedRoute stores target and redirects to login | Please sign in to continue. |
| `/k` root destination is ambiguous | App redirects according to current route config; exact target Needs verification | Not shown; automatic redirect. |
| Materials list is empty | Screen shows empty state instead of failing | No materials yet. |
| Student materials API route differs from client expectation | Request fails until route contract is verified | Could not load materials. |
| Pin/unpin/share action fails | Store should keep or restore previous state | Could not update this material. |
| History stats fail to load | History page shows recoverable error/empty state | Could not load history. |
| Session expires while loading workspace data | Axios refreshes once or redirects to login | Your session expired. Please sign in again. |
| Mobile tab shows mock data | UI does not reflect backend data until wired | Needs verification; avoid user-facing production claim. |

## Artifact References
- `behavior-logic.md` BL004-BL006, BL032-BL033, BL053, BL070-BL072
- `api-map.md` API009, API010
- `permissions.md` PERM008, PERM022, PERM040
