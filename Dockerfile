# ==============================================================================
# LogHub — Multi-stage Docker build для Railway
# Yarn Berry 4.13.0 (nodeLinker: node-modules) + NestJS 11 + Prisma 6
# ==============================================================================

# ---- Build Stage ----
FROM node:20-alpine AS builder

# bcrypt — нативный аддон, требует build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Yarn Berry через corepack (packageManager в package.json)
RUN corepack enable

# Docker layer cache — зависимости меняются редко
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/loghub-client/package.json ./packages/loghub-client/
COPY prisma ./prisma/

# --immutable: Yarn Berry эквивалент --frozen-lockfile
RUN yarn install --immutable

# Prisma Client (linux-musl query engine для Alpine)
RUN yarn prisma generate

# Сборка (webpack bundle → dist/main.js)
COPY src ./src/
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
RUN yarn build

# ---- Production Stage ----
FROM node:20-alpine AS production

# bcrypt — нативная компиляция при install
RUN apk add --no-cache python3 make g++

# Non-root пользователь для безопасности (principle of least privilege)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/loghub-client/package.json ./packages/loghub-client/
COPY prisma ./prisma/

# Yarn Berry nodeLinker:node-modules не поддерживает --production флаг.
# Полная установка + очистка кэша для уменьшения размера образа.
RUN yarn install --immutable && \
    yarn prisma generate && \
    yarn cache clean

# Webpack bundle из builder stage
COPY --from=builder /app/dist ./dist

# Очистка build tools после компиляции нативных аддонов (~50MB)
RUN apk del python3 make g++ && rm -rf /tmp/* /root/.cache

# Передаём права на /app новому пользователю перед переключением контекста
RUN chown -R nestjs:nodejs /app

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check для локального тестирования (Railway использует свой healthcheckPath)
# Допущение: PORT=3000 (из ENV выше), API_PREFIX=api (дефолт env.validation.ts)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Запуск от non-root пользователя
USER nestjs

# Запуск: сначала миграции БД, затем приложение
CMD ["sh", "-c", "yarn prisma migrate deploy && node dist/main.js"]
