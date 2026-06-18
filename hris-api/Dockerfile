# Multi-stage Dockerfile for high-performance Node.js LMS API application
FROM node:20-alpine AS base

# Set working directory
# CI smoke change: no functional impact.
WORKDIR /app

# Rebuild the source code only when needed
FROM base AS builder

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY webpack.config.js ./

# Install dependencies for build stage.
# Network fetches from npm can intermittently time out on the self-hosted runner,
# so give npm longer fetch windows and one controlled retry before failing.
RUN set -eux; \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000 \
    sh -c 'npm ci --prefer-offline --no-audit --no-fund --network-timeout=300000 || npm ci --prefer-offline --no-audit --no-fund --network-timeout=300000'; \
    test -x ./node_modules/.bin/prisma

# Copy source code
COPY app/ ./app/
COPY config/ ./config/
COPY helper/ ./helper/
COPY middleware/ ./middleware/
COPY utils/ ./utils/
COPY zod/ ./zod/
COPY lib/ ./lib/
COPY prisma/ ./prisma/
COPY docs/ ./docs/
COPY scripts/ ./scripts/
COPY assets/ ./assets/
COPY index.ts ./
COPY cron-entry.ts ./

# Generate Prisma client for PostgreSQL runtime using local CLI only.
RUN ./node_modules/.bin/prisma generate --schema prisma/schema-postgres

# Dedicated stage for local DB bootstrap jobs. Keep dev tooling like Prisma CLI available.
FROM builder AS db-init

# Production build stage: compile app and prune dev dependencies.
FROM builder AS production-build
RUN npm run build \
    && npm prune --omit=dev --legacy-peer-deps --ignore-scripts

# Production image, copy all the files and run the app
FROM base AS runner

# Install system dependencies for Prisma and database backups.
RUN apk add --no-cache libc6-compat openssl postgresql16-client

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser
RUN mkdir -p /app/logs /var/backups/hris && chown -R nodeuser:nodejs /app/logs /var/backups/hris

# Copy built application with final ownership to avoid expensive recursive chown
COPY --chown=nodeuser:nodejs --from=production-build /app/dist ./dist
COPY --chown=nodeuser:nodejs --from=production-build /app/node_modules ./node_modules
COPY --chown=nodeuser:nodejs --from=production-build /app/package*.json ./
COPY --chown=nodeuser:nodejs --from=production-build /app/prisma ./prisma
COPY --chown=nodeuser:nodejs --from=production-build /app/generated ./generated
COPY --chown=nodeuser:nodejs --from=production-build /app/assets ./assets
COPY --chown=nodeuser:nodejs --from=production-build /app/app ./app
COPY --chown=nodeuser:nodejs --from=production-build /app/lib ./lib
COPY --chown=nodeuser:nodejs --from=production-build /app/docs ./docs

USER nodeuser

# Expose port
EXPOSE 3001

# Health check (TCP port check)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('net').connect(process.env.PORT||3000,'localhost').once('connect',()=>process.exit(0)).once('error',()=>process.exit(1))"

# Start the application
CMD ["node", "dist/server.js"] 
