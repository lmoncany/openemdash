# OpenEmDash — self-hosted EmDash CMS
# Multi-stage build targeting demos/simple (Node.js + SQLite)

# ── Stage 1: Install deps + build ──────────────────────────────
FROM node:24-slim AS builder

# better-sqlite3 needs python3 + build tools for native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

# Copy everything (filtered by .dockerignore)
COPY . .

# Install all deps (need full workspace for workspace:* links)
RUN pnpm install --frozen-lockfile

# Build packages first, then the demo
RUN pnpm run build && cd demos/simple && pnpm run build

# ── Stage 2: Production image ──────────────────────────────────
FROM node:24-slim AS runtime

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

# Copy the built workspace
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/demos/simple ./demos/simple

# Create data directories (SQLite DB + uploads)
RUN mkdir -p /app/demos/simple/data /app/demos/simple/uploads

ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production

EXPOSE 4321

WORKDIR /app/demos/simple

CMD ["node", "./dist/server/entry.mjs"]
