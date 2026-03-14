# Развёртывание (Deployment)

## Обзор

LogHub разворачивается на **Railway** с использованием Docker-образа (multi-stage build).

Инфраструктура:
- **Railway Service** — основной NestJS-сервис (Dockerfile)
- **Railway PostgreSQL Plugin** — база данных (автоматический `DATABASE_URL`)
- **Railway Redis Plugin** — кэш и дедупликация (автоматический `REDIS_URL`)

## Переменные окружения

Все переменные настраиваются через **Railway Dashboard → Variables**.

### Автоматические (Railway plugins)

| Переменная | Источник | Описание |
|---|---|---|
| `DATABASE_URL` | Railway PostgreSQL plugin | URI подключения к PostgreSQL. Заполняется автоматически при подключении плагина |
| `REDIS_URL` | Railway Redis plugin | URI подключения к Redis. Заполняется автоматически при подключении плагина |

### Обязательные (ручная настройка)

| Переменная | Минимум | Описание | Генерация |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | Токен бота из BotFather. Формат: `{bot_id}:{token}` | BotFather → /newbot |
| `TELEGRAM_FORUM_CHAT_ID` | — | ID Telegram-группы (форум). Отрицательное число | Добавить бота в группу, получить ID через API |
| `ADMIN_LOGIN` | 3 символа | Логин администратора | Произвольный |
| `ADMIN_PASSWORD` | 12 символов | Пароль администратора. Сильный, уникальный | `openssl rand -base64 24` |
| `ADMIN_JWT_SECRET` | 32 символа | Секрет для подписи JWT-токенов | `openssl rand -hex 32` |
| `HMAC_SECRET` | 32 символа | Секрет для хеширования API-ключей. **Смена аннулирует все существующие ключи!** | `openssl rand -hex 32` |
| `CORS_ORIGIN` | — | Разрешённый origin для CORS. Конкретный URL (не `*`). Несколько через запятую | `https://admin.example.com` |
| `NODE_ENV` | — | Режим работы | `production` |

### Опциональные (есть дефолты)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3000` | Порт сервера. Railway может переопределить автоматически |
| `API_PREFIX` | `api` | Префикс всех API-маршрутов. **⚠️ Для Railway должен оставаться `api`** — `railway.toml` `healthcheckPath="/api/health"` завязан на этот дефолт. При смене нужно обновить и `railway.toml` |
| `LOG_LEVEL` | `info` | Уровень логирования: `debug`, `info`, `warn`, `error` |

### Важные замечания

- `HMAC_SECRET` — критически важный секрет. При его смене **все ранее выданные API-ключи перестанут работать**, т.к. HMAC-хеши в БД не совпадут с новыми
- `CORS_ORIGIN` — в production **никогда** не использовать `*`. Указывать конкретный домен
- `ADMIN_JWT_SECRET` — используется для подписи JWT. При компрометации — немедленная ротация
- Все секреты должны быть **уникальными** для каждого окружения (staging, production)

## Пошаговый деплой на Railway

### 1. Создание проекта

1. Зайти на [railway.com](https://railway.com) → **New Project**
2. Выбрать **Deploy from GitHub Repo**
3. Подключить репозиторий `tg-logs`

### 2. Подключение базы данных

1. В проекте нажать **+ New** → **Database** → **PostgreSQL**
2. `DATABASE_URL` заполнится автоматически в переменных сервиса
3. Рекомендуется: добавить `?sslmode=require` к `DATABASE_URL` для шифрования

### 3. Подключение Redis

1. В проекте нажать **+ New** → **Database** → **Redis**
2. `REDIS_URL` заполнится автоматически
3. Railway Redis имеет пароль по умолчанию

### 4. Настройка переменных окружения

В Railway Dashboard → Service → **Variables** добавить все обязательные переменные (см. таблицу выше).

Команды для генерации секретов:

```bash
# JWT-секрет для админки
openssl rand -hex 32

# HMAC-секрет для API-ключей
openssl rand -hex 32

# Пароль админа
openssl rand -base64 24
```

### 5. Первый деплой

1. Railway автоматически обнаружит `Dockerfile` и `railway.toml`
2. Сборка: multi-stage Docker build (~3-5 минут первый раз)
3. При старте: `prisma migrate deploy` применит миграции к PostgreSQL
4. Затем `node dist/main.js` запустит сервер
5. Railway проверит health endpoint: `GET /api/health`

### 6. Проверка

```bash
# Health check
curl https://your-app.railway.app/api/health
# Ожидаемый ответ: {"status":"healthy","services":{"database":"ok","redis":"ok"}}
```

## Dockerfile

### Двухстадийная сборка

**Build Stage** (`node:20-alpine`):
1. Устанавливает build tools для bcrypt (`python3 make g++`)
2. `corepack enable` — активирует Yarn Berry 4.13.0 через corepack
3. `yarn install --immutable` — устанавливает все зависимости (Yarn Berry эквивалент `--frozen-lockfile`)
4. `yarn prisma generate` — генерирует Prisma Client с linux-musl query engine
5. `yarn build` — webpack bundle в `dist/main.js`

**Production Stage** (`node:20-alpine`):
1. Повторная установка зависимостей (чистый node_modules без артефактов сборки)
2. `yarn prisma generate` — свежий Prisma Client для production
3. Очистка: `yarn cache clean` + удаление build tools (`apk del`)
4. Копирует `dist/` из builder stage
5. CMD: миграции БД → запуск сервера

### Адаптации для Yarn Berry

Спека `10-deployment.md` написана для Yarn Classic v1. Адаптации:
- `--frozen-lockfile` → `--immutable`
- `--production` → не поддерживается в Yarn Berry с `nodeLinker: node-modules`. Используется полная установка
- Добавлен `corepack enable` перед каждым yarn-вызовом
- Копируется `.yarnrc.yml` для настройки `nodeLinker`
- Копируется `packages/loghub-client/package.json` для workspace resolution

## Миграции

### Текущий подход (CMD)

Миграции запускаются при каждом старте контейнера:
```
CMD ["sh", "-c", "yarn prisma migrate deploy && node dist/main.js"]
```

`prisma migrate deploy` идемпотентен — применяет только не применённые миграции. При отсутствии новых миграций выполнение мгновенное.

### Альтернатива: preDeployCommand

Railway поддерживает `preDeployCommand` — команду, которая выполняется **до** старта нового деплоя:

```toml
[deploy]
preDeployCommand = "yarn prisma migrate deploy"
```

Преимущества:
- Миграция выполняется один раз (не при каждом рестарте)
- При ошибке миграции деплой откатывается

Текущая конфигурация использует CMD-подход по спецификации.

## Мониторинг

### Health endpoint

```
GET /api/health
```

Ответ (HTTP 200 всегда):
```json
{
  "status": "healthy",
  "services": {
    "database": "ok",
    "redis": "ok"
  }
}
```

- `healthy` — все сервисы доступны
- `degraded` — один или более сервисов недоступен
- `healthcheckTimeout = 5` — максимальное время ожидания ответа от endpoint (секунды). Если за 5 секунд ответа нет — проверка считается неуспешной. Периодичность проверок Railway определяет самостоятельно

### Railway Logs

В Railway Dashboard → Service → **Observability** доступны:
- Build logs — логи сборки Docker-образа
- Deploy logs — логи запуска и работы приложения
- Фильтрация по времени и уровню

## Безопасность

### Секреты

- Все секреты хранятся **только** в Railway Variables — никогда в Dockerfile или git
- `.env` файл исключён из Docker-образа через `.dockerignore`
- В production Swagger UI отключён (`NODE_ENV=production`)

### Подключения

- **PostgreSQL**: рекомендуется `?sslmode=require` в `DATABASE_URL`
- **Redis**: Railway Redis автоматически защищён паролем
- **CORS**: конкретный origin (не `*`), поддерживается несколько через запятую

### HTTP-заголовки

В production автоматически включены через `@fastify/helmet`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy`
