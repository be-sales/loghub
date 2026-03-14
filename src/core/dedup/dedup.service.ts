import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@redis/redis.service';
import {
  DEDUP_REDIS_PREFIX,
  DEDUP_WINDOW_SECONDS,
  DEDUP_FLUSH_TTL_THRESHOLD_SECONDS,
  DEDUP_SCAN_COUNT,
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
    try {
      const key = `${DEDUP_REDIS_PREFIX}${fingerprint}`;

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
        return false;
      }

      await this.incrementCount(key);

      return true;
    } catch (error) {
      this.logger.error(
        'Redis недоступен для дедупликации, пропускаем',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /**
   * Получает все активные записи дедупликации с count > 1
   * и TTL ≤ DEDUP_FLUSH_TTL_THRESHOLD_SECONDS (near-expiry).
   * Вызывается из DedupFlushService.
   */
  async getActiveEntries(): Promise<
    Array<{ fingerprint: string; value: DedupValue }>
  > {
    const entries: Array<{ fingerprint: string; value: DedupValue }> = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${DEDUP_REDIS_PREFIX}*`,
        'COUNT',
        DEDUP_SCAN_COUNT,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl < 0 || ttl > DEDUP_FLUSH_TTL_THRESHOLD_SECONDS) continue;

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
