---
type: debugger
date: 2026-06-13
title: "502 Bad Gateway: kmaedu.fayedark.com /api/v1/* — Root Cause Analysis"
---

# 502 Bad Gateway: kmaedu.fayedark.com /api/v1/* — Root Cause Analysis

## Executive Summary

**Root cause:** The frontend nginx container proxies `/api/` to `${BACKEND_URL}/api/`, but `BACKEND_URL` is set to `http://kmaedu-gateway:7000` — the internal Docker hostname that is only reachable within the Docker network. The backend is not publicly accessible on that URL, so nginx cannot connect to the upstream and returns 502 Bad Gateway.

**Primary fix:** Set `BACKEND_URL` to the actual publicly accessible backend URL (e.g., `http://<VPS_HOST_IP>:6369` or a domain like `https://kmaedu.fayedark.com`) in the frontend's `.env` or `docker compose` environment section.

---

## Deployment Architecture

### Frontend (`kmaedu-fe/`)
- **Location:** `kmaedu.fayedark.com` (Cloudflare Pages / Vercel / or nginx container)
- **API URL:** `VITE_API_URL=/api/v1` — relative path, so browser calls go to `kmaedu.fayedark.com/api/v1/*`
- **Served by:** nginx Docker container (Dockerfile stage 3: `nginx:1.27-alpine`)
- **Nginx proxy config** (`nginx.conf` line 38):
  ```nginx
  location /api/ {
      proxy_pass ${BACKEND_URL}/api/;
      ...
  }
  ```
- **Docker compose env:** `BACKEND_URL=${BACKEND_URL:-http://kmaedu-gateway:7000}`
  - Default value `http://kmaedu-gateway:7000` is the **internal Docker container hostname**
  - Only resolvable within the `kmaedu-network` Docker bridge network

### Backend (`kmaedu-be/deploy/`)
- **Location:** VPS, behind a "hidden backend link" (not publicly accessible)
- **Gateway exposed as:** `6369:7000` (host port 6369 → container port 7000)
- **Internal service URLs** (docker-compose env vars):
  | Service | URL | Port |
  |---|---|---|
  | auth | `http://auth:7001` | 7001 |
  | exam | `http://exam:7002` | 7002 |
  | finance | `http://finance:7003` | 7003 |
  | admin | `http://admin:7006` | 7006 |
  | ai | `http://ai:7005/api` | 7005 |
- **Internal gRPC ports:** auth:50051, finance:50053, r2:50054, admin:50056

---

## Root Cause

### Primary: `BACKEND_URL` Points to Internal Docker Hostname

The frontend nginx's `proxy_pass ${BACKEND_URL}/api/` resolves to `http://kmaedu-gateway:7000` by default. This hostname only exists inside the Docker `kmaedu-network`. From outside (or from a separate VPS), `kmaedu-gateway` cannot be resolved.

**Request flow that produces 502:**
```
Browser → kmaedu.fayedark.com/api/v1/auth/login
  → Frontend nginx (kmaedu.fayedark.com) → proxy_pass ${BACKEND_URL}/api/
    → BACKEND_URL = http://kmaedu-gateway:7000  ← NOT reachable externally
      → nginx gets "could not be resolved (nginx: [host not found]") or "Connection refused"
        → nginx returns 502 Bad Gateway to browser
```

### Secondary: Possible Dual-VPS Deployment Without Network Connectivity

If frontend and backend run on **separate VPS instances**, the Docker container names (`kmaedu-gateway`, `kmaedu-frontend`) are not shared across hosts. Even if `BACKEND_URL` is set to `http://<VPS1_IP>:6369`, the frontend nginx may still fail if port 6369 is not open or if a firewall blocks it.

---

## Files and Settings That Need to Change

### 1. Frontend `.env` or docker-compose environment (PRIMARY FIX)

**File:** `kmaedu-fe/.env` (or whatever env file is used for the frontend container)

Set `BACKEND_URL` to the publicly accessible backend URL:

```bash
# Option A: IP + port (if VPS1 IP is accessible)
BACKEND_URL=http://<VPS1_IP>:6369

# Option B: Domain pointing to backend VPS
BACKEND_URL=https://kmaedu.fayedark.com
# (requires DNS A record kmaedu.fayedark.com → VPS1_IP and nginx to forward :443 → :6369)
```

Or in `kmaedu-fe/docker-compose.yml`, override the environment:

```yaml
services:
    frontend:
        environment:
            - BACKEND_URL=http://<VPS1_IP>:6369   # ← change from default
```

### 2. Ensure Backend Gateway Port is Open

**File:** Backend VPS firewall / cloud console

- Port **6369** on the backend VPS must be open to the frontend's source IP (or `0.0.0.0/0` if IP-restriction is not needed)
- Cloudflare DNS: ensure `kmaedu.fayedark.com` (or whichever subdomain) resolves to the backend VPS public IP

### 3. Optional: Add Reverse Proxy for SSL (Recommended for Production)

**File:** Backend VPS (nginx/Caddy on host, not in container)

The backend docker-compose does NOT include an SSL-terminating reverse proxy. The README explicitly states:
> "Use SSL/TLS in production with a reverse proxy (nginx/traefik)"

If the backend should be accessible via HTTPS:

```nginx
# /etc/nginx/sites-available/kmaedu-api
server {
    listen 443 ssl;
    server_name kmaedu.fayedark.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:6369;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then set `BACKEND_URL=https://kmaedu.fayedark.com` in the frontend.

---

## Verification Steps

After applying the fix, verify:

```bash
# 1. Check backend gateway is reachable from frontend VPS (or externally)
curl -s -o /dev/null -w "%{http_code}" http://<VPS1_IP>:6369/api/v1/health
# Expected: 200

# 2. Check nginx substituted BACKEND_URL correctly inside container
docker exec kmaedu-frontend cat /etc/nginx/conf.d/default.conf | grep proxy_pass
# Should show: proxy_pass http://<VPS1_IP>:6369/api/;  (not kmaedu-gateway:7000)

# 3. Full end-to-end test from external machine
curl -s -o /dev/null -w "%{http_code}" https://kmaedu.fayedark.com/api/v1/health
# Expected: 200
```

---

## What is NOT the Problem

| Misconception | Reality |
|---|---|
| "Backend services are not running" | Services are running inside Docker — health checks in docker-compose confirm they are healthy |
| "Gateway port 7000 is wrong" | Gateway correctly listens on 7000 inside container, exposed as 6369 on host |
| "Nginx config is wrong" | The nginx `proxy_pass` syntax is correct; the variable `${BACKEND_URL}` just has the wrong value |
| "Auth/Finance service URLs are wrong" | Service URLs in docker-compose (`http://auth:7001`, etc.) are correct — they resolve inside the Docker network |

---

## Summary of Changes Needed

1. **`kmaedu-fe/.env` or `kmaedu-fe/docker-compose.yml`:** Set `BACKEND_URL` to the publicly accessible backend URL (VPS IP:6369 or `https://kmaedu.fayedark.com`)
2. **Backend VPS firewall:** Ensure port 6369 is open to frontend's source
3. **DNS (optional):** Point `kmaedu.fayedark.com` → backend VPS IP if using domain
4. **SSL reverse proxy (optional but recommended):** Add nginx/Caddy on backend VPS host for HTTPS

---

## Unresolved Questions

1. What is the actual public IP or domain of the backend VPS? This is needed to set `BACKEND_URL` correctly.
2. Is the frontend deployed on the same VPS as the backend, or on a separate host (Cloudflare Pages, Vercel, etc.)?
3. Is port 6369 on the backend VPS open in the firewall (UFW/iptables/cloud security group)?
4. Is SSL required? If yes, is there an existing SSL cert on the backend VPS?
