# Phase 06 response-shape and contract changes (for P09 FE)

Sources: `evidence/phase-06-runs.md` (run log, follow-ups 1-5, live smoke) and `evidence/phase-06/inspection-verdict.json`. The implementer summaries were not in the evidence folder, so anything not stated in those two files is marked "(spec title only)".

## Removed or narrowed responses

| Route | Before | After | FE action (P09) |
|---|---|---|---|
| `GET /quizsets/public/:id` | answers and public quiz payload | route removed; STUDENT 404, anonymous 401 at gateway | none (FE does not call it); confirm mobile in P18 |
| `GET /flashcardsets/public/:id`, `study/:id/info`, `study/:id/access` | payload had `accessCode`, `whitelist` | keys stripped (mapper pick-by-name) | none |
| `GET /flashcardsets/study/:id` | payload had `accessCode`, `whitelist` | keys stripped. Granted STUDENT 200; TEACHER non-owner 403; private no-grant STUDENT 404; code-protected set 403 `CODE_REQUIRED` | handle 403 `CODE_REQUIRED` and route to the code form |
| `GET /examsessions/study/:id`, `POST study/:id/with-code`, `GET study/:id/stats` | answers (`isCorrect`/`answer`), `accessCode`, `whitelist` | deep-stripped | none for keys; handle 403/404 per rule above |
| `GET /examattempts/get-by-id/:id`, `:id/detail` (examinee) | full session incl. `accessCode` and `whitelist`; quiz answers even while open | attempt view mapper: no `accessCode`/`whitelist`; answer keys only when status COMPLETED AND `showAnswersAfterSubmit` is true. Host always sees keys | examinee UI must tolerate missing answers |
| `POST /examattempts/start`, `POST /examattempts`, `PUT /examattempts/:id` responses | raw session include | same mapper as get-by-id (no `accessCode`/`whitelist`) | none |
| `GET /examrooms/get-public/:id` | host email | `{ id, title, description, host: { name, avatar } }`; no email. 404 unless the room has a public session | handle 404 |
| `GET /flashcardsets/users/search`, `GET /examsessions/users/search` | matched `email contains`, returned email | `q` min 3 chars, max 10 results, match username/name prefix or exact email; returns `{ id, username, name, avatar }` only. TEACHER only (STUDENT 403, `q` under 3 gives 400) | update the search UI (no email shown) |
| `GET /student/recent-flashcards` | every public set | owned + whitelisted + previously viewed sets only | none (list narrower) |
| `POST /flashcardsets/:id/share` | any authed user on public sets | owner only (other TEACHER and STUDENT refused) | student share button (`MyMaterialsPage.tsx:433`) breaks until P07 builds the link client-side (accepted transient) |
| `GET /ai-chat/:chatId/exists` | any chat id | owner filter: false for another user's chat | none |
| `GET /wallet/info`, `details` (STUDENT) | 404 | 403 PERMISSION_DENIED (`wallet:use`) | handle 403 |
| `POST /ai/*`, `POST /ai-chat`, `POST /quizsets`, manage pages (STUDENT) | allowed | 403 PERMISSION_DENIED | hide nav and handle 403 |
| `POST /word-family/generate` (STUDENT) | allowed | 403; TEACHER 21st generation in a day gets 429 | hide for STUDENT; handle 429 |
| `PATCH /admin/users/:id` | accepted `isAdmin` | `isAdmin`, `isSystemAdmin`, `role` rejected (role path is `grant-admin`/`revoke-admin`, replaced in P08) | none for P09 |

## Error codes (new or changed)

| Route | Code | Meaning |
|---|---|---|
| `verify-code`, `with-code`, `examattempts/start` (accessCode) | 400 `INVALID_CODE` | wrong code (counted) |
| same | 400 | malformed code, not `^\d{6}$` (not counted) |
| same | 429 `CODE_LOCKED` `{ retryAfterSeconds }` | 5 failures in 900 s; a correct code is also refused while locked |
| same | 503 `CODE_CHECK_UNAVAILABLE` | Redis down (fail closed) |
| same | now requires auth (was anonymous for `verify-code`) | 401/403 when not authed |
| all non-owned resources | 404 | no existence leak; 403 only on permission denial |
| `POST /studyrooms/:id/join` with no body | 400 (was 500) | FE sends `{ inviteCode }` |
| exam controllers, multipart | 400 on malformed DTO (Zod pipe) | previously 500, 404 or silent default (`isPublic` false) |
| session and catch-all paths | real 4xx kept (was masked as 500) | Prisma messages are not leaked |
| `GET /examattempts/...` (non-host teacher, other student) | 404 | ownership rule |

## Study-room WebSocket (`/ws/study`)

| Event | Payload | When |
|---|---|---|
| `connect_error` | `PERMISSION_DENIED` | token lacks `study_room:join` (e.g. SYSTEM_ADMIN-only) |
| `connect_error` | `EMAIL_NOT_VERIFIED` | `email_verified` false |
| `connect_error` | `TOKEN_STALE` | token `av` below gateway mirror `gw:user:<sub>:av` |
| `connect_error` | `SERVICE_UNAVAILABLE` | Redis error (fail closed) |
| `connect_error` | `TOKEN_*` | signature, `iss`, `aud`, `exp`, `typ` failure |
| `auth:reauth` | `{ reason: 'TOKEN_EXPIRED' }` then disconnect | token `exp` reached while connected |
| `auth:reauth` | `{ reason: 'AUTHZ_CHANGED' }` then disconnect | `auth.user.authz_changed` with a higher `authzVersion` |

FE must refresh and reconnect on `auth:reauth` (P09). Until then, local testing shows "disconnected" after 15 min.

## Not a shape change (listed so P09 does not look for one)

- Access codes now come from `crypto.randomInt` (still 6 digits).
- Wallet and payment cache invalidation (best-effort after commit). Stale reads are bounded by the cache TTL only if invalidation fails.
- Gateway: `GET /quizsets/public/:id` anonymous returns 401 (gateway auth-required prefix), not 404.

## Open items on this list

- Remembered code-unlock state is not in place until P07 (a code unlock lasts one request).
- Browser FE pass on exam-session and study-room forms with the Zod pipe is owed in P09.
