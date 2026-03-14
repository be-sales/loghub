# ServicesModule

## Назначение

CRUD-управление внешними сервисами, отправляющими логи. Генерация и хеширование API-ключей (HMAC-SHA256). Просмотр логов с фильтрами и пагинацией.

## ServicesService API

| Метод | Описание |
|-------|----------|
| `create(input)` | Создание сервиса + генерация API-ключа. Ключ показывается один раз |
| `findAll()` | Список всех сервисов с `_count.errorLogs` |
| `findById(id)` | Один сервис по ID |
| `update(id, input)` | Partial update (name, description, isActive). Инвалидация Redis-кэша при смене isActive |
| `remove(id)` | Каскадное удаление (сервис + все error logs). Инвалидация кэша |
| `regenerateKey(id)` | Новый API-ключ, старый немедленно невалиден. Redis-кэш: удаление старого + прогрев нового |
| `findByApiKeyHash(hash)` | Поиск сервиса по хешу ключа (используется `ApiKeyGuard`) |
| `findLogs(query)` | Логи с фильтрами (serviceId, level, from, to, search) + пагинация |

## API Key

**Формат:** `sk_live_` + 32 hex символа (16 случайных байт)

**Хранение:** HMAC-SHA256 хеш (с `HMAC_SECRET` из env). Оригинальный ключ НЕ хранится.

**apiKeyLast4:** последние 4 символа ключа — для отображения в админке.

**Кэш:** `apikey:{hash}` → `{ "serviceId": string, "slug": string }` в Redis, TTL 300 секунд.

> `isActive` НЕ кэшируется — это мутабельное auth-состояние, всегда читается из БД.

**Жизненный цикл:**
1. Создание сервиса → генерация ключа → показ один раз → хеш в БД
2. Запрос с ключом → `ApiKeyGuard` → hash → Redis cache / DB lookup → resolve serviceId
3. Перегенерация → новый ключ, старый хеш удалён → кэш инвалидирован

## Slug валидация

```
SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/
```

- 3–50 символов
- Только латиница (lowercase), цифры, дефис
- Начинается и заканчивается буквой/цифрой
- Unique constraint в БД → `ConflictException` при дубликате

## Пагинация (findLogs)

**Фильтры:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `serviceId` | `string?` | Фильтр по сервису |
| `level` | `LogLevel?` | Уровень ошибки |
| `from` | `ISO 8601?` | Начало диапазона |
| `to` | `ISO 8601?` | Конец диапазона |
| `search` | `string?` (max 200) | Поиск по тексту ошибки (case-insensitive) |
| `page` | `number` (default 1) | Номер страницы |
| `pageSize` | `number` (default 50, max 200) | Размер страницы |

**Ответ:** `PaginatedResult<ErrorLogWithService>` — каждый лог включает вложенный объект `service: { name: string; slug: string }`. Meta: page, pageSize, total, totalPages.

## Константы

| Константа | Значение | Описание |
|-----------|----------|----------|
| `API_KEY_PREFIX` | `'sk_live_'` | Префикс ключа |
| `API_KEY_LENGTH` | `32` | Длина hex-части |
| `API_KEY_CACHE_TTL_SECONDS` | `300` | TTL кэша (5 мин) |
| `API_KEY_CACHE_PREFIX` | `'apikey:'` | Префикс Redis-ключа кэша |
| `SLUG_REGEX` | `/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/` | Валидация slug |
| `DEFAULT_PAGE_SIZE` | `50` | Размер страницы по умолчанию |
| `MAX_PAGE_SIZE` | `200` | Макс. размер страницы |

## Расположение

- Сервис: `src/core/services/services.service.ts`
- Модуль: `src/core/services/services.module.ts`
- Тесты: `test/unit/services.service.spec.ts`
