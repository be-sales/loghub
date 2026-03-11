# RedisModule

## Назначение

Глобальный модуль для работы с Redis. Предоставляет `RedisService` всем модулям приложения без явного импорта.

## RedisService API

Наследует `ioredis.Redis`. Все методы ioredis доступны напрямую (`get`, `set`, `del`, `incr`, `scan` и т.д.).

### Конструктор

Принимает `ConfigService`, читает `REDIS_URL` из env. Настройки:

- `maxRetriesPerRequest: 3` — максимум попыток на запрос
- `retryStrategy` — линейный backoff: `times * 200ms`, потолок `2000ms`

### Lifecycle

- **constructor** — создаёт подключение, регистрирует обработчики `connect` и `error`
- **onModuleDestroy()** — вызывает `quit()`, корректно закрывает подключение

## Конфигурация

| Переменная | Описание | Пример |
|------------|----------|--------|
| `REDIS_URL` | URL подключения к Redis | `redis://localhost:6379` |

## Константы (shared/constants)

| Константа | Значение | Описание |
|-----------|----------|----------|
| `REDIS_MAX_RETRIES_PER_REQUEST` | `3` | Макс. попыток на запрос |
| `REDIS_RETRY_DELAY_STEP_MS` | `200` | Шаг задержки retry (мс) |
| `REDIS_MAX_RETRY_DELAY_MS` | `2000` | Макс. задержка retry (мс) |

## Redis-структуры данных

### Дедупликация

```
Ключ:    dedup:{fingerprint}
Значение: JSON { "count": number, "serviceId": string, "firstLogId": string }
TTL:     180 секунд (DEDUP_WINDOW_SECONDS)
```

### Кэш API-ключей

```
Ключ:    apikey:{apiKeyHash}
Значение: JSON { "serviceId": string, "slug": string, "isActive": boolean }
TTL:     300 секунд (API_KEY_CACHE_TTL_SECONDS)
```

### Rate limiter Telegram

```
Ключ:    tg_rate:{second_timestamp}
Значение: counter (INCR)
TTL:     2 секунды
```

## Использование

```typescript
import { RedisService } from '@redis/redis.service';

@Injectable()
export class SomeService {
  constructor(private readonly redis: RedisService) {}

  async cacheValue(key: string, value: string, ttl: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttl);
  }

  async getCachedValue(key: string): Promise<string | null> {
    return this.redis.get(key);
  }
}
```
