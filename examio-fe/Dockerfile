# =============================================================================
# Examio Frontend - Optimized Multi-stage Dockerfile
# =============================================================================
# Final image: nginx:alpine (~30MB) instead of node (~1GB)
# Build: node for compilation, nginx for serving static files
# =============================================================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare yarn@4.9.2 --activate
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

# Stage 2: Build
FROM deps AS builder
WORKDIR /app
COPY . .
ARG VITE_API_URL
ARG VITE_MEASUREMENT_ID
ARG VITE_TURNSTILE_SITE_KEY
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_MEASUREMENT_ID=${VITE_MEASUREMENT_ID} \
    VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY} \
    VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
RUN yarn build

# Stage 3: Production - nginx alpine (~30MB final image)
FROM nginx:1.27-alpine AS runner

RUN apk add --no-cache curl

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD curl -f http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
