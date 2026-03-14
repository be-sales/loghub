import { TelegramFormatterService } from '@core/telegram/telegram-formatter.service';
import {
  TELEGRAM_MAX_MESSAGE_LENGTH,
  TELEGRAM_STACK_MAX_LINES,
} from '@shared/constants';

describe('TelegramFormatterService', () => {
  let formatter: TelegramFormatterService;

  beforeEach(() => {
    formatter = new TelegramFormatterService();
  });

  const basePayload = {
    logId: 'test-log-id',
    level: 'ERROR',
    message: 'Connection failed to database',
    fingerprint: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  };

  describe('formatErrorLog', () => {
    it('должен содержать emoji, level, timestamp и message', () => {
      const result = formatter.formatErrorLog(basePayload);

      expect(result).toContain('🔴');
      expect(result).toContain('ERROR');
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
      expect(result).toContain('Connection failed to database');
      expect(result).toContain('abcdef12');
    });

    it('должен обрезать stack trace до 15 строк', () => {
      const stackLines = Array.from(
        { length: 20 },
        (_, i) => `    at function${i} (file${i}.ts:${i}:1)`,
      );
      const payload = {
        ...basePayload,
        stackTrace: stackLines.join('\n'),
      };

      const result = formatter.formatErrorLog(payload);

      // Первые 15 строк присутствуют
      for (let i = 0; i < TELEGRAM_STACK_MAX_LINES; i++) {
        expect(result).toContain(`function${i}`);
      }

      // 16-я и далее — нет
      expect(result).not.toContain('function15');
      expect(result).not.toContain('function19');

      // Суффикс с количеством обрезанных строк
      expect(result).toContain('... ещё 5 строк');
    });

    it('должен форматировать metadata как JSON', () => {
      const payload = {
        ...basePayload,
        metadata: { userId: 'u1', path: '/api/test' },
      };

      const result = formatter.formatErrorLog(payload);

      expect(result).toContain('userId');
      expect(result).toContain('/api/test');
      expect(result).toContain('📎');
    });

    it('должен ограничивать общую длину до TELEGRAM_MAX_MESSAGE_LENGTH', () => {
      const payload = {
        ...basePayload,
        message: 'x'.repeat(10_000),
      };

      const result = formatter.formatErrorLog(payload);

      expect(result.length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_LENGTH);
      expect(result).toContain('... (обрезано)');
    });

    it('должен корректно закрывать HTML-теги при обрезке внутри <code>', () => {
      const longStack = Array.from(
        { length: 15 },
        (_, i) => `    at function${i} (${'x'.repeat(300)}.ts:${i}:1)`,
      ).join('\n');
      const payload = {
        ...basePayload,
        stackTrace: longStack,
      };

      const result = formatter.formatErrorLog(payload);

      expect(result.length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_LENGTH);
      expect(result).toContain('... (обрезано)');

      // Проверяем что все открытые теги закрыты
      const openCode = (result.match(/<code>/g) || []).length;
      const closeCode = (result.match(/<\/code>/g) || []).length;
      expect(openCode).toBe(closeCode);

      const openB = (result.match(/<b>/g) || []).length;
      const closeB = (result.match(/<\/b>/g) || []).length;
      expect(openB).toBe(closeB);
    });

    it('должен экранировать HTML-спецсимволы', () => {
      const payload = {
        ...basePayload,
        message: '<script>alert("xss")</script> & more > less',
      };

      const result = formatter.formatErrorLog(payload);

      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&amp; more');
      expect(result).toContain('&gt; less');
      expect(result).not.toContain('<script>');
    });
  });

  describe('formatDedupSummary', () => {
    it('должен содержать repeatCount и windowSeconds', () => {
      const result = formatter.formatDedupSummary({
        level: 'ERROR',
        message: 'DB connection error',
        repeatCount: 47,
        windowSeconds: 180,
      });

      expect(result).toContain('47');
      expect(result).toContain('3 мин');
      expect(result).toContain('🔴');
      expect(result).toContain('⚠️');
      expect(result).toContain('DB connection error');
    });
  });

  describe('formatWelcomeMessage', () => {
    it('должен содержать имя и slug сервиса', () => {
      const result = formatter.formatWelcomeMessage('My Service', 'my-svc');

      expect(result).toContain('My Service');
      expect(result).toContain('my-svc');
      expect(result).toContain('🔧');
    });
  });

  describe('levelEmoji', () => {
    it('должен возвращать корректные emoji для каждого уровня', () => {
      const levels: Array<{ level: string; emoji: string }> = [
        { level: 'DEBUG', emoji: '⚪' },
        { level: 'INFO', emoji: '🔵' },
        { level: 'WARN', emoji: '🟡' },
        { level: 'ERROR', emoji: '🔴' },
        { level: 'FATAL', emoji: '💀' },
        { level: 'UNKNOWN', emoji: '❓' },
      ];

      for (const { level, emoji } of levels) {
        const result = formatter.formatDedupSummary({
          level,
          message: 'test',
          repeatCount: 1,
          windowSeconds: 60,
        });

        expect(result).toContain(emoji);
      }
    });
  });
});
