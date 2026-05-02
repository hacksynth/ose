FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM base AS builder
WORKDIR /app
ENV DOCKER_BUILD=1
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema src/prisma/schema.prisma
RUN npm run build
RUN mkdir -p /app/seed \
  && DATABASE_URL=file:/app/seed/ose.db npx prisma migrate deploy --schema src/prisma/schema.prisma \
  && DATABASE_URL=file:/app/seed/ose.db npx tsx src/prisma/seed.ts

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN mkdir -p /data && chown nextjs:nodejs /data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/src/prisma ./src/prisma
COPY --from=builder /app/scripts/docker-start.sh ./scripts/docker-start.sh
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Bake a migrated, pre-seeded SQLite database into the image. First boot only
# copies this file into the mounted data volume instead of importing thousands
# of rows at container startup.
COPY --from=builder /app/seed ./seed
RUN chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# On first boot, copy the pre-seeded database into the mounted data volume.
# Existing databases are never overwritten; future images can still apply new
# migrations before starting the app.
CMD ["sh", "scripts/docker-start.sh"]
