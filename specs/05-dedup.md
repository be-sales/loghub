# 05 — Дедупликация и Throttling

## 5.1 Концепция

Цель: подавить спам одинаковых ошибок в Telegram, сохраняя все логи в БД для аналитики.

**Принцип:** Первое сообщение проходит мгновенно. Повторы в пределах окна 3 минуты подавляются. По завершении окна отправляется summary с количеством повторов.

## 5.2 Алгоритм

```
Получена ошибка с fingerprint F
          │
          ▼
  Redis: GET dedup:{F}
          │
    ┌─────┴─────┐
    │            │
  exists      not exists
    │            │
    ▼            ▼
  INCR count   SET dedup:{F}
  return        value: JSON { count: 1, serviceId, firstLogId }
  isDuplicate   TTL: 180 sec
  = true        NX (only if not exists — race condition safe)
                return isDuplicate = false
                → отправить в Telegram
```

## 5.3 Redis-структура

### Ключ дедупликации

```
Ключ:    dedup:{fingerprint}
           └── SHA-256 hex string (64 символа)

Значение: JSON string
{
  "count": 1,              // Количество вхождений (INCR при дубликатах)
  "serviceId": "clz...",   // ID сервиса для lookup при flush
  "firstLogId": "clz..."   // ID первого лога (для ссылки в summary)
}

TTL: 180 секунд (DEDUP_WINDOW_SECONDS)
```

### Пример ключа

```
dedup:a3f8c1d2e4b5...  →  {"count":47,"serviceId":"clz1abc...","firstLogId":"clz2def..."}
                           TTL: 23 sec remaining
```

## 5.4 DedupService (core/dedup/dedup.service.ts)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@redis/redis.service';
import {
  DEDUP_REDIS_PREFIX,
  DEDUP_WINDOW_SECONDS,
} from '@shared/constants';

interface DedupValue {
  count: number;
  serviceId: string;
  firstLogId: string;
}

@Injectable()
export class DedupService {
  private readonly logger = new Logger(DedupService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Проверяет, является ли ошибка дубликатом в текущем окне.
   * Если нет — маркирует как первое вхождение.
   * Если да — инкрементирует счётчик.
   *
   * @returns true если дубликат (НЕ нужно отправлять в Telegram)
   */
  async checkAndMark(
    fingerprint: string,
    serviceId: string,
    logId?: string,
  ): Promise<boolean> {
    const key = `${DEDUP_REDIS_PREFIX}${fingerprint}`;

    // Атомарная операция: SET NX + EX
    // Если ключ НЕ существует — создаём, возвращаем "OK"
    // Если ключ существует — возвращаем null (не перезаписываем)
    const initialValue: DedupValue = {
      count: 1,
      serviceId,
      firstLogId: logId ?? '',
    };

    const result = await this.redis.set(
      key,
      JSON.stringify(initialValue),
      'EX',
      DEDUP_WINDOW_SECONDS,
      'NX',
    );

    if (result === 'OK') {
      // Первое вхождение — не дубликат
      return false;
    }

    // Дубликат — инкрементируем счётчик
    // Используем Lua-скрипт для атомарного JSON update
    await this.incrementCount(key);

    return true;
  }

  /**
   * Получает все активные записи дедупликации с count > 1.
   * Вызывается из DedupFlushService.
   */
  async getActiveEntries(): Promise<Array<{ fingerprint: string; value: DedupValue }>> {
    const entries: Array<{ fingerprint: string; value: DedupValue }> = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${DEDUP_REDIS_PREFIX}*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const raw = await this.redis.get(key);
        if (!raw) continue;

        try {
          const value = JSON.parse(raw) as DedupValue;
          if (value.count > 1) {
            const fingerprint = key.slice(DEDUP_REDIS_PREFIX.length);
            entries.push({ fingerprint, value });
          }
        } catch {
          this.logger.warn(`Невалидный JSON в ключе ${key}`);
        }
      }
    } while (cursor !== '0');

    return entries;
  }

  /**
   * Удаляет запись дедупликации (после отправки summary).
   */
  async clearEntry(fingerprint: string): Promise<void> {
    await this.redis.del(`${DEDUP_REDIS_PREFIX}${fingerprint}`);
  }

  /**
   * Атомарный инкремент count в JSON-значении.
   * Lua-скрипт гарантирует атомарность при конкурентном доступе.
   */
  private async incrementCount(key: string): Promise<void> {
    const luaScript = `
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
    `;

    await this.redis.eval(luaScript, 1, key);
  }
}
```

## 5.5 DedupFlushService (core/dedup/dedup-flush.service.ts)

Cron job, который запускается каждые 3 минуты и отправляет summary для подавленных дубликатов.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DedupService } from './dedup.service';
import { TelegramService } from '@core/telegram/telegram.service';
import { PrismaService } from '@prisma/prisma.service';
import { DEDUP_WINDOW_SECONDS } from '@shared/constants';

@Injectable()
export class DedupFlushService {
  private readonly logger = new Logger(DedupFlushService.name);
  private isRunning = false;

  constructor(
    private readonly dedup: DedupService,
    private readonly telegram: TelegramService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Каждые 3 минуты проверяет записи дедупликации с count > 1
   * и отправляет summary в Telegram.
   *
   * ВАЖНО: isRunning guard предотвращает параллельный запуск
   * если предыдущий flush ещё не завершился.
   */
  @Cron(CronExpression.EVERY_10_SECONDS) // Проверяем чаще, но отправляем только для expired/high-count
  async flush(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const entries = await this.dedup.getActiveEntries();

      for (const entry of entries) {
        const { fingerprint, value } = entry;
        const repeatCount = value.count - 1; // -1 потому что первый уже отправлен

        if (repeatCount <= 0) continue;

        try {
          // Получаем информацию о последнем логе с этим fingerprint
          const lastLog = await this.prisma.errorLog.findFirst({
            where: { fingerprint },
            orderBy: { createdAt: 'desc' },
            select: {
              message: true,
              level: true,
              serviceId: true,
            },
          });

          if (!lastLog) continue;

          await this.telegram.sendDedupSummary(
            lastLog.serviceId,
            {
              level: lastLog.level,
              message: lastLog.message,
              repeatCount,
              windowSeconds: DEDUP_WINDOW_SECONDS,
            },
          );

          // Очищаем запись после отправки summary
          await this.dedup.clearEntry(fingerprint);
        } catch (error) {
          this.logger.error(
            `Ошибка flush для fingerprint=${fingerprint.slice(0, 16)}...`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
```

### 5.5.1 Альтернативный подход: EVERY_10_SECONDS + проверка TTL

Вместо `EVERY_3_MINUTES` используем `EVERY_10_SECONDS` с проверкой: flush только те записи, чей TTL ≤ 10 секунд (т.е. окно почти истекло). Это даёт более своевременные summary:

```typescript
// В getActiveEntries добавить проверку TTL:
const ttl = await this.redis.ttl(key);
if (ttl > 10) continue; // Окно ещё не истекло, ждём
```

**Рекомендация:** Использовать подход с `EVERY_10_SECONDS` + проверкой TTL. Это даёт лучший timing summary-сообщений.

## 5.6 DedupModule (core/dedup/dedup.module.ts)

```typescript
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DedupService } from './dedup.service';
import { DedupFlushService } from './dedup-flush.service';
import { TelegramModule } from '@core/telegram/telegram.module';

@Module({
  imports: [ScheduleModule.forRoot(), TelegramModule],
  providers: [DedupService, DedupFlushService],
  exports: [DedupService],
})
export class DedupModule {}
```

**Важно:** `ScheduleModule.forRoot()` должен быть импортирован один раз. Если уже импортирован в AppModule — убрать из DedupModule и использовать просто `ScheduleModule`.

## 5.7 Edge Cases

### 5.7.1 Race condition при SET NX

Два идентичных запроса приходят одновременно:
- Оба делают `SET ... NX`
- Один получает `OK`, другой `null`
- Победитель отправляет в Telegram, проигравший — нет
- **Результат корректен:** ровно одно сообщение в Telegram

### 5.7.2 Redis недоступен

Если Redis упал:
- `checkAndMark` должен вернуть `false` (не дубликат) — лучше лишнее сообщение, чем потерянное
- Обернуть в try-catch с fallback:

```typescript
async checkAndMark(...): Promise<boolean> {
  try {
    // ... основная логика ...
  } catch (error) {
    this.logger.error('Redis недоступен для дедупликации, пропускаем', error);
    return false; // Не дубликат — отправляем в Telegram
  }
}
```

### 5.7.3 Очень высокая частота ошибок

Если за 3 минуты count > 1000:
- Summary-сообщение отправляется с точным числом
- В будущем можно добавить alert-уровень: если count > порога, отправлять в отдельный "алерт" топик

### 5.7.4 Разные сервисы с одинаковым сообщением

Fingerprint включает `serviceId` → каждый сервис дедуплицируется независимо.
