---
title: "260607-2228-docker-buildx-lease"
session_date: 2026-06-07
plan: none
status: complete
---

# Session Journal — 260607-2228-docker-buildx-lease

## What

Fixed `docker compose build` failure caused by Docker buildx cache lease error when pulling `python:3.12-slim` for the `ai` service.

## Root cause

Docker Desktop `desktop-linux` buildx context had a stale cache lease for the `python:3.12-slim` manifest SHA. The lease was released/invalidated but buildx still tried to `commit` the freshly-pulled image metadata, hitting `lease does not exist: not found`.

8 of 9 services were CANCELED due to dependency chain, but only `ai` failed explicitly — the Node-based services all had `node:20-alpine` already cached.

## Fix

```bash
docker pull python:3.12-slim       # seed local image cache
cd kmaedu-be/deploy
docker compose build                # now uses local image, no fresh commit
```

## Verification

```
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

All 9 images built successfully. No code changes — pure operational fix.

## Files changed

None. (No code defect.)

## Prevention (deferred, out of scope)

- Pin base images by digest in `Dockerfile` to skip tag-resolution.
- Periodically `docker builder prune` to clear stale leases.
- Switch to legacy `docker build` if buildx lease errors recur on a specific machine.

## Committed

- N/A — no code changes.

## Next

- (carry to user) Optional: `docker compose up -d` to start all services, or `docker compose run --rm seed` to test the auto-seed path.
