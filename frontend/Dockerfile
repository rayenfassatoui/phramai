# ── Build stage ──────────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# Accept build-time env for Next.js NEXT_PUBLIC_* variables
ARG NEXT_PUBLIC_FASTAPI_URL=http://localhost:8000
ENV NEXT_PUBLIC_FASTAPI_URL=$NEXT_PUBLIC_FASTAPI_URL

# Copy dependency manifests first for layer caching
COPY package.json bun.lock* ./

# Install all dependencies (including devDependencies needed for build)
RUN bun install --frozen-lockfile

# Copy application source
COPY . .

# Build Next.js with standalone output
RUN bun run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Create non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

# Copy standalone output, static assets, and public directory
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appgroup /app/public ./public

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
