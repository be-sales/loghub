# DedupModule

## Назначение

Дедупликация ошибок через Redis с окном 3 минуты. Первая ошибка с уникальным fingerprint проходит в Telegram, повторы подавляются. По истечении окна cron-job отправляет summary: «Ошибка повторилась ещё N раз за 3 мин».

## Алгоритм (DedupService.checkAndMark)

Ключ Redis:

```
dedup:{fingerprint}
```

Значение: JSON

```json
{ "count": 1, "serviceId": "clxyz...", "firstLogId": "clxyz..." }
```

TTL: `DEDUP_WINDOW_SECONDS = 180` (3 минуты)

### Поток

1. `SET key value EX 180 NX`
2. Если `OK` — первое вхождение, return `false` (не дубликат → отправить в Telegram)
3. Если `null` — дубликат → атомарный инкремент через Lua → return `true`
4. Redis failure → graceful fallback, return `false` (пропускаем в Telegram)

## Lua-скрипт инкремента

Атомарный инкремент `count` с сохранением оставшегося TTL:

```lua
local raw = redis.call('GET', KEYS[1])
if raw then
  local data = cjson.decode(raw)
  data.count = data.count + 1
  local ttl = redis.call('TTL', KEYS[1])
  if ttl > 0 then
    redis.call('SET', KEYS[1], cjson.encode(data), 'EX', ttl)
  end
end
return 1
```

## Flush (DedupFlushService)

Cron: `EVERY_10_SECONDS`

Guard: `isRunning` флаг предотвращает параллельный запуск.

### Поток

1. `SCAN dedup:*` (по `DEDUP_SCAN_COUNT = 100` ключей за проход)
2. Для каждого ключа: проверить TTL ≤ `DEDUP_FLUSH_TTL_THRESHOLD_SECONDS` (10) и `count > 1`
3. Найти последний `ErrorLog` по fingerprint (`findFirst`, `orderBy: createdAt desc`)
4. Отправить `TelegramService.sendDedupSummary()` — «Ошибка повторилась ещё N раз за 3 мин»
5. Удалить запись: `DedupService.clearEntry(fingerprint)` → `DEL dedup:{fingerprint}`

## Константы

| Константа | Значение | Описание |
|-----------|----------|----------|
| `DEDUP_WINDOW_SECONDS` | `180` | Окно дедупликации (3 мин) |
| `DEDUP_FLUSH_INTERVAL_MS` | `180_000` | Интервал flush cron (не используется — cron через CronExpression) |
| `DEDUP_REDIS_PREFIX` | `'dedup:'` | Префикс Redis-ключей |
| `DEDUP_FLUSH_TTL_THRESHOLD_SECONDS` | `10` | Порог TTL для flush |
| `DEDUP_SCAN_COUNT` | `100` | Количество ключей за один SCAN |

## Расположение

- DedupService: `src/core/dedup/dedup.service.ts`
- DedupFlushService: `src/core/dedup/dedup-flush.service.ts`
- Модуль: `src/core/dedup/dedup.module.ts`
- Тесты: `test/unit/dedup.service.spec.ts`
