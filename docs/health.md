# Health Check

## Назначение

Endpoint проверки здоровья сервиса. Проверяет подключение к PostgreSQL и Redis.
Используется для мониторинга и readiness probes.

## Endpoint

```
GET /api/health
```

Не требует аутентификации.

## Ответ

HTTP 200 всегда. Статус определяется по телу ответа.

### healthy (все зависимости доступны)

```json
{
  "status": "healthy",
  "services": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### degraded (одна или более зависимостей недоступны)

```json
{
  "status": "degraded",
  "services": {
    "database": "error",
    "redis": "ok"
  }
}
```

## Проверяемые зависимости

| Сервис | Метод проверки | Ключ в ответе |
|--------|---------------|---------------|
| PostgreSQL | `$queryRaw\`SELECT 1\`` | `database` |
| Redis | `ping()` | `redis` |

## Расположение

- Контроллер: `src/health.controller.ts`
- Регистрация: `src/app.module.ts` (controllers)
- Тесты: `test/unit/health.controller.spec.ts`
