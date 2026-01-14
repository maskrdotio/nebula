# Build stage
FROM node:24-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Prepare Nuxt (generates auto-imports, types, etc.)
RUN pnpm postinstall

# Build the SSR application
RUN pnpm build

# Production stage
FROM node:24-alpine AS production

WORKDIR /app

# Copy built output from builder
COPY --from=builder /app/.output /app/.output

# Expose port 3000
EXPOSE 3000

ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", ".output/server/index.mjs"]
