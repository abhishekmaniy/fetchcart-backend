# syntax=docker/dockerfile:1.7

# -------------------------------
# Base image
# -------------------------------
FROM node:20-bookworm-slim AS base

WORKDIR /app

ENV NODE_ENV=production

# Install tiny init for proper signal handling
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init ca-certificates \
  && rm -rf /var/lib/apt/lists/*


# -------------------------------
# Dependencies stage
# Installs all deps including dev deps for TypeScript build
# -------------------------------
FROM base AS deps

ENV NODE_ENV=development

COPY package*.json ./

RUN npm ci


# -------------------------------
# Build stage
# Compiles TypeScript into dist/
# -------------------------------
FROM deps AS builder

COPY tsconfig*.json ./
COPY drizzle.config.* ./
COPY src ./src

RUN npm run build


# -------------------------------
# Production dependencies only
# -------------------------------
FROM base AS prod-deps

COPY package*.json ./

RUN npm ci --omit=dev \
  && npm cache clean --force


# -------------------------------
# Runtime image
# -------------------------------
FROM base AS runtime

# Create non-root user
RUN groupadd --system nodejs \
  && useradd --system --gid nodejs --home-dir /app nodejs

WORKDIR /app

# Copy production node_modules
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy package files
COPY package*.json ./

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Optional: copy drizzle files only if your app needs them at runtime
COPY drizzle.config.* ./

USER nodejs

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]

# Default command = API + WebSocket server
CMD ["node", "dist/index.js"]