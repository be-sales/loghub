# AdminModule

## Назначение

REST API для администрирования LogHub: аутентификация, CRUD сервисов, просмотр логов. JWT аутентификация через HttpOnly cookie (fallback: Bearer header). Throttle на endpoint логина (5 попыток / 15 мин).

## Визуальная админка

У сервиса есть browser UI по пути `/admin`. Это лёгкая одностраничная админка, которая живёт на том же домене, что и backend, и использует существующий Admin API без отдельного frontend-сервиса.

Что доступно в v1:

- логин через форму `POST /api/admin/login`
- список сервисов
- создание нового сервиса
- редактирование `name`, `description`, `isActive`
- удаление сервиса
- перегенерация API key
- one-time reveal полного API key с готовым env snippet:
  - `LOGHUB_ENDPOINT=https://<текущий-домен>`
  - `LOGHUB_API_KEY=<новый ключ>`

### Login flow UI

- Страница `/admin` всегда отдаёт HTML shell
- UI не читает JWT из JavaScript
- После успешного входа backend ставит `HttpOnly` cookie `access_token`
- Все запросы из UI идут через `fetch(..., { credentials: 'include' })` в `/api/admin/*`
- При любом `401` UI сбрасывается обратно в экран логина

## Аутентификация

### Login

`POST /api/admin/login` — логин/пароль → JWT в HttpOnly Secure SameSite cookie.

- HTTP 204 (без тела), токен в `Set-Cookie: access_token`
- Cookie options: `httpOnly`, `secure` (production), `sameSite: strict`, `path: /api/admin`, `maxAge: 86400`
- Throttle: `LOGIN_THROTTLE_LIMIT = 5` попыток за `LOGIN_THROTTLE_TTL_SECONDS = 900` (15 мин)

### Logout

`POST /api/admin/logout` — очистка cookie. Требует `AdminGuard`.

### Безопасность

- **Login:** SHA-256 + `timingSafeEqual` (constant-time сравнение одинаковой длины буферов)
- **Password:** bcrypt (`BCRYPT_ROUNDS = 12`) — timing-safe по дизайну
- **JWT payload:** `{ sub: login, role: 'admin', jti: UUID }`, expiry `ADMIN_JWT_EXPIRY = '24h'`
- **AdminGuard:** cookie `access_token` first → `Authorization: Bearer` header fallback

### Credentials (env)

| Переменная | Описание | Ограничения |
|------------|----------|-------------|
| `ADMIN_LOGIN` | Логин администратора | min 3 символа |
| `ADMIN_PASSWORD` | Пароль администратора | min 12 символов |
| `ADMIN_JWT_SECRET` | Секрет для JWT | min 32 символа |

## Endpoints

| Метод | Путь | Guard | Описание |
|-------|------|-------|----------|
| POST | `/api/admin/login` | Throttle | Вход (JWT в cookie) |
| POST | `/api/admin/logout` | AdminGuard | Выход (очистка cookie) |
| POST | `/api/admin/services` | AdminGuard | Создать сервис |
| GET | `/api/admin/services` | AdminGuard | Список сервисов |
| GET | `/api/admin/services/:id` | AdminGuard | Сервис по ID |
| PATCH | `/api/admin/services/:id` | AdminGuard | Обновить сервис |
| DELETE | `/api/admin/services/:id` | AdminGuard | Удалить сервис (каскадно) |
| POST | `/api/admin/services/:id/regenerate-key` | AdminGuard | Перегенерация API-ключа |
| GET | `/api/admin/logs` | AdminGuard | Логи с фильтрами и пагинацией |

## DTO

| DTO | Описание |
|-----|----------|
| `LoginDto` | `login` (string 1–100), `password` (string 1–200) |
| `CreateServiceDto` | `name` (string 2–100), `slug` (SLUG_REGEX), `description?` (string max 500) |
| `UpdateServiceDto` | `name?`, `description?`, `isActive?` — все опциональны |
| `LogsQueryDto` | `serviceId?`, `level?`, `from?`, `to?`, `search?` (max 200), `page?` (default 1), `pageSize?` (default 50, max 200) |

## Константы

| Константа | Значение | Описание |
|-----------|----------|----------|
| `ADMIN_JWT_EXPIRY` | `'24h'` | Время жизни JWT |
| `BCRYPT_ROUNDS` | `12` | Раунды bcrypt |
| `LOGIN_THROTTLE_TTL_SECONDS` | `900` | Окно rate limit (15 мин) |
| `LOGIN_THROTTLE_LIMIT` | `5` | Макс. попыток за окно |
| `COOKIE_MAX_AGE_SECONDS` | `86_400` | TTL cookie (24 часа) |
| `DEFAULT_PAGE_SIZE` | `50` | Размер страницы по умолчанию |
| `MAX_PAGE_SIZE` | `200` | Макс. размер страницы |

## Расположение

- Контроллер: `src/admin/admin.controller.ts`
- Auth сервис: `src/admin/admin-auth.service.ts`
- Guard: `src/shared/guards/admin.guard.ts`
- DTO: `src/admin/dto/login.dto.ts`, `create-service.dto.ts`, `update-service.dto.ts`, `logs-query.dto.ts`
- Модуль: `src/admin/admin.module.ts`
- Visual UI shell: `src/admin-ui/`
- Runtime registration: `src/admin-ui/register-admin-ui.ts`
