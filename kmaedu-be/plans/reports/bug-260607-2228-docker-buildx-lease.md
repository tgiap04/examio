---
type: bug
date: 2026-06-07
title: Docker buildx lease error for python:3.12-slim base image in ai-service
---

# Bug — `docker compose build` fails with buildx lease error on `python:3.12-slim`

## Symptom

`docker compose build` from `kmaedu-be/deploy/` failed with:

```
target ai: failed to solve: python:3.12-slim: failed to resolve source metadata for docker.io/library/python:3.12-slim:
failed commit on ref "index-sha256:090ba77e2958f6af52a5341f788b50b032dd4ca28377d2893dcf1ecbdfdfe203":
commit failed: lease does not exist: not found
```

8 of 9 services were CANCELED in the dependency chain (admin, exam, finance, gateway, auth, seed, migration, r2) — only `ai` failed explicitly because it was the first service to attempt pulling `python:3.12-slim` (Node-based services all had `node:20-alpine` already cached).

## Root cause

Docker buildx `desktop-linux` context had a stale cache lease for the `python:3.12-slim` image manifest. When buildx tried to commit the freshly-pulled image metadata into the buildx cache layer store, the lease had already been released or invalidated by a previous session — typical of a Docker Desktop context that has been running for a long time and whose internal state has drifted from the local image store.

Key evidence:
- `node:20-alpine` (used by other 8 services) was already CACHED → those services reached `load metadata` step in 0.0s.
- `python:3.12-slim` was NOT in local image store → buildx went to pull, and the resulting `commit` to cache hit the stale lease.
- `docker images | grep python` returned empty before the manual pull.
- `docker pull python:3.12-slim` succeeded in ~30s — the registry was reachable; the issue was purely buildx's cache commit step.

## Fix

Pulled the base image manually so Docker's local image cache contains it, then ran the build again:

```bash
# From repo root or any directory — pulls into Docker's local image store
docker pull python:3.12-slim

# Then build (now the lease problem is avoided because the image is already in local cache,
# and buildx can reference it via the overlay/cache layer without committing fresh metadata)
cd kmaedu-be/deploy
docker compose build
```

## Verification

```
$ docker pull python:3.12-slim
3.12-slim: Pulling from library/python
Digest: sha256:090ba77e2958f6af52a5341f788b50b032dd4ca28377d2893dcf1ecbdfdfe203
Status: Downloaded newer image for python:3.12-slim
docker.io/library/python:3.12-slim

$ cd kmaedu-be/deploy && docker compose build
 Image deploy-auth    Built
 Image deploy-admin   Built
 Image deploy-seed    Built
 Image deploy-ai      Built
 Image deploy-finance Built
 Image deploy-exam    Built
 Image deploy-gateway Built
 Image deploy-migration Built
 Image deploy-r2      Built
exit 0
```

All 9 images built. The `python:3.12-slim` lease commit step now found the image already in local cache and reused it without re-committing fresh metadata.

## Prevention

This is a transient Docker Desktop / buildx cache state issue, not a code defect. It is not worth adding a code-level guard.

**Operational workaround** (no code change): when a fresh-base-image build fails with this exact `failed commit on ref ... lease does not exist` pattern, run `docker pull <image:tag>` once, then retry the build.

**Long-term mitigations** (out of scope; deferred):
- Periodically run `docker builder prune` to clear stale buildx cache leases.
- Pin base images by digest in `Dockerfile` (`FROM python:3.12-slim@sha256:...`) — eliminates tag-resolution at build time, and digests don't get re-resolved through the lease layer.
- Switch from `docker compose build` (uses buildx by default in Docker Desktop 4.x+) to `docker build` (legacy builder) if lease errors persist on a specific machine.

## Open questions

None.
