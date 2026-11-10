# Secret Rotation Checklist (C4 / H6)

**Done by Claude (2026-07-18):** app-internal signing secrets regenerated in all `.env` files —
`JWT_SECRET` (now 64 chars, identical across services, distinct dev vs prod), `INTERNAL_SERVICE_TOKEN`,
`QUIZ_JWT_SECRET`, `QUIZ_AES_KEY`, `REFRESH_TOKEN_SECRET`, and the new `REFRESH_TOKEN_ENC_KEY`.
Services will now pass the boot-time `JWT_SECRET`/`REFRESH_TOKEN_ENC_KEY` assertions.

**The following are LIVE third-party / infrastructure credentials that only YOU can rotate** — they live at
the provider (or on the DB/broker host), so changing the `.env` value alone would break the connection.
Rotate each at its source, then paste the new value into the corresponding `.env` (I can wire them in for you).

Treat all of these as **exposed** (they sat in plaintext `.env` on disk).

## Provider API keys — regenerate in the provider console

| Secret | Where to rotate | .env key(s) |
|--------|-----------------|-------------|
| Gemini API keys (×11) | Google AI Studio / Google Cloud console → API keys → revoke old, create new | `GEMINI_API_KEYS` (ai-service, deploy) |
| Cloudflare R2 access/secret key pair | Cloudflare dashboard → R2 → Manage API Tokens → roll | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |
| SePay API key + webhook secret | SePay merchant dashboard → API/webhook settings | `SEPAY_*` key + webhook secret |
| Google OAuth client secret (`GOCSPX-…`) | Google Cloud console → Credentials → OAuth client → reset secret | `GOOGLE_CLIENT_SECRET` |
| GitHub OAuth client secret | GitHub → Settings → Developer settings → OAuth App → generate new secret | `GITHUB_CLIENT_SECRET` |
| Gmail app password | Google account → Security → App passwords → revoke + create | `MAIL_PASS` / SMTP password |

## Infrastructure passwords — rotate on the host, then update `.env`

| Secret | How | .env key(s) |
|--------|-----|-------------|
| PostgreSQL password (host `sv.fayedark.com`) | `ALTER USER … WITH PASSWORD '…'` on the DB, then update every `DATABASE_URL` | `DATABASE_URL` / `POSTGRES_PASSWORD` |
| Redis password | Set `requirepass` on the Redis host, then update | `REDIS_PASSWORD` |
| RabbitMQ / CloudAMQP creds | Rotate in the CloudAMQP console (new user or password), then update the URL | `RABBITMQ_URL` / `RABBITMQ_PASS` |
| `ADMIN_DEFAULT_PASSWORD` | Change to a strong value; if a seeded admin already exists, reset its password too | `ADMIN_DEFAULT_PASSWORD` |

## After rotating
- Keep dev and prod values **distinct** (the JWT assertion already enforces ≥32 chars).
- Redeploy so containers pick up the new `deploy/.env`.
- Long-term: move all of the above into a secrets manager (Doppler / Vault / 1Password / SSM) instead of flat `.env` files.
