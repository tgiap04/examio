# Per-service variable lists

`<svc>.env.example` documents which variables each service reads. Compose still
loads one `deploy/.env` (created from `deploy/.env.example`) and injects the
service-specific ones inline; use these files to see what a service needs, or to
run a single service outside compose. Roles that have no service yet
(`content`, `assessment`, `aichat`, `document`) only
need their `<SVC>_DB_PASSWORD` in `deploy/.env`.
