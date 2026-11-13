# Per-service runtime env

Each service container gets exactly one file, `deploy/env/<name>.env`, through `env_file`
(`required: true`: a missing file stops `docker compose up` before anything starts). The real
`*.env` files are gitignored; `<name>.env.example` is the committed template. Create them once:

```bash
cd deploy
for f in env/*.env.example; do cp -n "$f" "${f%.example}"; done   # then fill the empty KEY= lines
```

| File | Service(s) | Holds (examples) |
|---|---|---|
| `auth.env` | auth, `seed` one-shot | `ADMIN_*`, `REFRESH_TOKEN_ENC_KEY`, `EMAIL_*`, `GOOGLE_*` |
| `r2.env` | r2 | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` |
| `ai.env` | ai, ai-worker | `GEMINI_*`, `AI2_API_KEY` |
| `assessment.env` | assessment | `QUIZ_*` |
| `admin` / `aichat` / `content` / `document` / `gateway` / `studyroom` / `vocabulary` | the matching service | optional tunables only |

What does NOT go here: anything compose interpolates. Ports, `DATABASE_URL`, `REDIS_*`,
`RABBITMQ_URL`, `*_GRPC_URL`, `JWT_*`, `SERVICE_CLIENT_SECRET` and `FRONTEND_URL` are set inline in
`deploy/compose/<svc>.yml` from `deploy/.env` (compose-level: database and broker passwords,
Postgres superuser, Redis password, JWT keypair, service-token secrets). A key set inline wins over
the same key in the file, so do not repeat those here.

Empty `KEY=` lines are required; commented lines are optional tunables with their default. A service
only sees its own file: `content` has no `GOOGLE_CLIENT_SECRET` and no R2 keys. To run one service outside compose, `set -a; . env/<name>.env; set +a` plus the inline
variables listed in its compose file.

Variable lists were derived from what each service reads at boot (`process.env`, `ConfigService`,
`os.environ`), checked against `deploy/compose/<svc>.yml`.
