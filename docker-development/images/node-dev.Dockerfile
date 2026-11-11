# kmaedu-dev-node:local - every Node container of docker-development (apps, migrate jobs, deps, seed,
# fe) and the one-shot secret generator. Source and node_modules are mounted, never copied in.
#   docker build -t kmaedu-dev-node:local -f images/node-dev.Dockerfile images
# Runs as root: macOS bind mounts map ownership through virtiofs.
FROM node:22-alpine

# bash: prisma:deploy and kmaedu-be/scripts; openssl: Prisma engines + secret generation; git: yarn git deps
RUN apk add --no-cache bash openssl git \
 && corepack enable \
 && corepack prepare yarn@4.9.2 --activate

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace
