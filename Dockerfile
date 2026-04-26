FROM node:20-alpine AS base

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
RUN npx prisma generate
RUN npm run build

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
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Bake the question-bank seed into the image. Only the converted JSON is
# needed at runtime; the raw 51CTO exam scrapes (data/51cto-exams/) and the
# AI classification map (data/51cto-classifications.json) are build-time
# artefacts and stay out of the image.
COPY --from=builder /app/data/51cto-seed.json ./data/51cto-seed.json
RUN chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# On first boot: apply migrations, then run the seeder once and drop a marker
# in the data volume so subsequent restarts skip the (~30s) seed step. To
# force a re-seed (e.g. after pulling a new question-bank version), delete
# /data/.seeded inside the volume.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy --schema src/prisma/schema.prisma && { [ -f /data/.seeded ] || ./node_modules/.bin/tsx src/prisma/seed.ts && touch /data/.seeded; } && node server.js"]
