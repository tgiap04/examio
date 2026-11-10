# Phase 16: deploy independence, and the four bugs only a live rehearsal could find

**Date**: 2026-10-28
**Severity**: high (one cutover blocker caught before production)
**Component**: kmaedu-be/deploy (Dockerfile.node, deploy-service.sh, compose, runbook), .github/workflows, kmaedu-fe nginx, ai-service worker, ai-chat regenerate
**Status**: resolved (signed off 2026-10-28)

## What Happened

Phase 16 is 9 commits, `bc4d709..aec9c20`, on top of `2137847`, not pushed.
- **Images:** every Node service builds from one `Dockerfile.node` and the `ROLE` switch selects what runs (api, worker, migrate, seed). Images go to GHCR.
- **Deploy:** `deploy.yml` deploys only the changed services, in waves: changed gRPC servers first, then the rest. Each one goes through `deploy-service.sh`, which gates on migrate, halts on P3009 and rolls back automatically. The job stays off until `CUTOVER_DONE`.
- **Compose:**
  - each container reads only its own `env/<name>.env`;
  - the gateway is two instances behind the FE nginx;
  - no backend container publishes a port.

The tester ran a full local cutover rehearsal: the old `main` stack with sample data, `pg_dump`, the runbook on a new stack from empty volumes, the smoke script, then rollback with `pg_restore` and an old login. All of it passed.

## The Brutal Truth

Unit tests, typecheck and a green CI config caught none of the four real defects:
- **F1 (blocker):** the image never copied `templates/`. Register still returned 201, but every verify and reset mail failed with "Template not found". The old root Dockerfile had the COPY; the new recipe dropped it.
- **F3:** `ai-worker` stayed healthy for 3.5 minutes with RabbitMQ stopped. aio-pika's robust connection is never `is_closed` while it retries; the live signal is `connection.connected`.
- **F4:** one "socket hang up" in 7500 requests during a gateway rollout. The cause was the `nginx -s reload` we added "for safety": with upstream `resolve`, the reload adds nothing and closes idle client keep-alive connections. A reload-only control reproduced it; after the reload was removed, 4 of 4 runs were clean.
- **F11:** came out of the topology question. Behind a host proxy, FE nginx sees the Docker bridge IP and ignores `CF-Connecting-IP`, so every user shares one address. The login limit of 5 per minute per IP would have locked out the whole site. A live curl showed `172.17.0.1` without the fix.

Review found two regressions this phase introduced:
- Admission now runs before deleting, so it counted the messages a regenerate replaces. A full chat could no longer regenerate.
- Replacing the full-stack `down`/`up` with per-service deploys silently dropped the step that loaded RabbitMQ definitions into the broker.

## Technical Details

- **Evidence:** 203 green rows in `evidence/phase-16/temper-final.json` (raw 222).
- **Review:** opus round 1 REWORK (4 Medium); round 2 SEALED. Evidence gate SEALED.
- **Deferred:**
  - N1: two concurrent regenerates can leave two pairs; fix with a Redis `SET NX` claim.
  - F15: rollout load is mostly 429 under the per-IP limit.
  - F14: nginx connect-refused log noise.
  - The seed one-shot loads all of `auth.env`.
- **The topology spec commit:** the egress fix (`bc4d709`) had to be split out of a file that also held phase-16 changes. It was committed through a temporary index (`read-tree HEAD` + `update-index --cacheinfo` + `commit-tree`), because the index already held staged deletions.
- **Process miss:** git-manager's pre-commit secret scan never ran (a pattern beginning `-----` was parsed as a grep option). It was re-run after the commits, and only placeholders came back.

## Lessons

- **A deploy change is only proven by a rehearsal:**
  - build the real images;
  - start from empty volumes;
  - send the real mail paths;
  - stop the broker.
  Every defect here was invisible to unit tests.
- **Prove the cause with a control:** reproduce the bug by applying only the suspected cause, then remove it and show the clean runs.
- **Deploy-path rewrites need an inventory:** a full `down`/`up` does implicit work (loading broker definitions). Before replacing it, list what it did.
- **"Who is the TCP peer?":** ask this whenever a proxy is added in front of nginx; real-IP trust follows the peer, not the header.
- **Moving work across an admission check:** recheck every count the check reads.
