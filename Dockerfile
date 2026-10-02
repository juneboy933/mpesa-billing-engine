# syntax=docker/dockerfile:1.7

# ---- Build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,id=npm-cache,target=/root/.npm,sharing=locked \
    npm ci \
      --fetch-retries=5 \
      --fetch-retry-factor=2 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000 \
      --fetch-timeout=600000

COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npx prisma generate

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ---- Production stage ----
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma7.config.ts ./

EXPOSE 3000
CMD ["node", "dist/main"]
