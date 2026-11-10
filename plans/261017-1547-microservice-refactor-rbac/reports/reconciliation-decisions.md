# Cross-Phase Reconciliation Decisions (lead, 2026-10-18) — authoritative

Precedence: decisions.md > this file > red-team-changes.md > planner-brief.md.

- **X1 Ban / SetUserStatus**: auth `SetUserStatus` is IMPLEMENTED in **P08** (auth `user-status/**` + gRPC). Remove the P04 interim admin-side ban and any admin→gateway `InvalidateUser` call. P10 does NOT implement `SetUserStatus` (it only migrates the remaining admin direct DB reads/writes to RPCs). P02 defines the proto; P05 has no ban logic. Because 04+05+08 deploy together, there is no interim gap.
- **X2 One authz event**: the only identity-authz event is `auth.user.authz_changed {userId, authzVersion, role, isSystemAdmin, isBanned, reason, version}`. Remove `auth.user.role_changed` everywhere. finance provisioning consumes `authz_changed` where `role=TEACHER` (idempotent ON CONFLICT). The gateway worker consumes it for `av`. study-room consumes it for disconnect/kick. A forced re-apply re-emits it.
- **X3 P10 provisioning**: P04 owns the full provisioning (ON CONFLICT, ensureWallet, reconcile-teachers, re-apply). P10 only adds the `welcome:<userId>` idempotency key on the welcome WalletTransaction and calls `ensureWallet` inside `Debit`. Delete the duplicated text in P10.
- **X4 WS disconnect event**: on `authz_changed` the server emits `auth:reauth` then disconnects (P06 naming). `room:kicked` stays ONLY for the in-room ban. P12 must match P06.
- **X5 Gateway key**: `gw:user:<id>:av` everywhere. Remove every `invalid_before` / `iat < invalid_before` mention in all phases.
- **X6 Allowlists in code**: service-caller allowlists live in `@ServiceOnly(...)` decorators, not env. Fix P13 ("r2 env DeleteObjects allowlist"). P11 step 7 is redundant with P04 (exam/auth already on `DeleteObjects`); trim it. The RabbitMQ file phases edit is `deploy/rabbitmq/definitions.template.json` (rendered at deploy).
- **X7 P13 grep gate**: P15 runs before P13, so `INTERNAL_SERVICE_TOKEN` is already gone. The P13 gate is the plain grep (no r2 exclusion).
- **X8 Claims**: `email_verified` and `av` are accepted additions to the JWT claims (`iss, aud, sub, sid, roles, email_verified, av, iat, exp`). `@AllowUnverified` list: me, logout, sendVerificationEmail, verifyAccount, send-code-change-password, change-password, devices, sync-refresh-token.
- **X9 Small fixes**:
  - P01 line saying "Phase 16 extends observability" → "Phase 17 (deferred)".
  - P05 must port the gateway log publisher (`log-publisher.service.ts` call from `proxy.middleware.ts`) into the new dispatcher so admin logs keep working until P17.
  - `/metrics` endpoints in P12/P15 → remove (P17 adds them with the obs stack).
  - P02 owns the FE compose `BACKEND_URL` default change (gateway port 7000 → 3000) since P02 changes the port; remove it from P05 if duplicated.
- **X10 Brief**: add a header note to `reports/planner-brief.md`: "Superseded where conflicting by red-team-changes.md and reconciliation-decisions.md" (do not rewrite the brief).
