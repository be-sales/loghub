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
    serviceName: 'LogHub API',
    serviceSlug: 'loghub-api',
    environment: 'production',
    logId: 'log_123',
    level: 'ERROR',
    message: 'PrismaClientKnownRequestError: Unique constraint failed on the fields: (`slug`)',
    fingerprint:
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    stackTrace: [
      'PrismaClientKnownRequestError: Unique constraint failed on the fields: (`slug`)',
      '    at ServicesService.create (/app/src/core/services/services.service.ts:131:15)',
      '    at AdminController.createService (/app/src/admin/admin.controller.ts:102:12)',
    ].join('\n'),
    metadata: {
      requestId: 'req_123',
      method: 'POST',
      path: '/api/admin/services',
      context: 'ServicesService.create',
      userId: 'usr_123',
      slug: 'railway-smoke',
      extra: {
        duplicate: true,
      },
    },
  };

  describe('formatErrorLog', () => {
    it('должен содержать сервис, environment, logId и fingerprint', () => {
      const result = formatter.formatErrorLog(basePayload);

      expect(result).toContain('🔴');
      expect(result).toContain('<b>ERROR · production</b>');
      expect(result).toContain('<b>LogHub API</b> · <code>loghub-api</code>');
      expect(result).toContain('<b>Log ID:</b> <code>log_123</code>');
      expect(result).toContain('<b>Fingerprint:</b> <code>abcdef12</code>');
      expect(result).toMatch(
        /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC[+-]\d{2}:\d{2}/,
      );
    });

    it('должен извлекать тип, контекст, HTTP и Request ID', () => {
      const result = formatter.formatErrorLog(basePayload);

      expect(result).toContain('<b>Тип:</b> PrismaClientKnownRequestError');
      expect(result).toContain('<b>Контекст:</b> ServicesService.create');
      expect(result).toContain('<b>HTTP:</b> POST /api/admin/services');
      expect(result).toContain('<b>Request ID:</b> <code>req_123</code>');
    });

    it('должен выносить ключевые metadata в отдельный блок и не дублировать promoted fields', () => {
      const result = formatter.formatErrorLog(basePayload);

      expect(result).toContain('<b>Ключевые данные:</b>');
      expect(result).toContain('userId=usr_123');
      expect(result).toContain('slug=railway-smoke');
      expect(result).not.toContain('"requestId": "req_123"');
      expect(result).not.toContain('"method": "POST"');
      expect(result).not.toContain('"path": "/api/admin/services"');
      expect(result).toContain('<b>Metadata:</b>');
      expect(result).toContain('"duplicate": true');
    });

    it('должен использовать stack как fallback-контекст при отсутствии metadata.context', () => {
      const result = formatter.formatErrorLog({
        ...basePayload,
        metadata: {
          requestId: 'req_123',
        },
      });

      expect(result).toContain('<b>Контекст:</b> ServicesService.create');
    });

    it('должен обрезать stack trace до максимума строк', () => {
      const payload = {
        ...basePayload,
        stackTrace: Array.from(
          { length: TELEGRAM_STACK_MAX_LINES + 5 },
          (_, index) => `    at function${index} (file${index}.ts:${index}:1)`,
        ).join('\n'),
      };

      const result = formatter.formatErrorLog(payload);

      expect(result).toContain('function0');
      expect(result).toContain(`... ещё 5 строк`);
      expect(result).not.toContain(`function${TELEGRAM_STACK_MAX_LINES + 1}`);
    });

    it('должен формировать компактный WARN без тяжёлых stack и metadata блоков', () => {
      const result = formatter.formatErrorLog({
        ...basePayload,
        level: 'WARN',
      });

      expect(result).toContain('🟡');
      expect(result).toContain('<b>WARN · production</b>');
      expect(result).toContain('<b>Сообщение:</b>');
      expect(result).not.toContain('<b>Тип:</b>');
      expect(result).not.toContain('<b>Stack:</b>');
      expect(result).not.toContain('<b>Metadata:</b>');
      expect(result).toContain('<b>Ключевые данные:</b>');
    });

    it('должен корректно экранировать HTML-спецсимволы', () => {
      const result = formatter.formatErrorLog({
        ...basePayload,
        message: '<script>alert("xss")</script> & more > less',
        metadata: { requestId: 'req_<1>' },
      });

      expect(result).toContain('&lt;script&gt;alert("xss")&lt;/script&gt;');
      expect(result).toContain('&amp; more &gt; less');
      expect(result).toContain('req_&lt;1&gt;');
      expect(result).not.toContain('<script>');
    });

    it('должен сохранять валидный HTML и лимит длины при длинном stack и metadata', () => {
      const result = formatter.formatErrorLog({
        ...basePayload,
        stackTrace: Array.from(
          { length: TELEGRAM_STACK_MAX_LINES },
          (_, index) => `TypeError: ${'x'.repeat(250)} at function${index}`,
        ).join('\n'),
        metadata: {
          requestId: 'req_123',
          userId: 'usr_123',
          extra: {
            payload: 'x'.repeat(10_000),
          },
        },
      });

      expect(result.length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_LENGTH);
      expect((result.match(/<pre>/g) || []).length).toBe(
        (result.match(/<\/pre>/g) || []).length,
      );
      expect((result.match(/<code>/g) || []).length).toBe(
        (result.match(/<\/code>/g) || []).length,
      );
      expect((result.match(/<b>/g) || []).length).toBe(
        (result.match(/<\/b>/g) || []).length,
      );
      expect(result).toContain('<b>Log ID:</b>');
      expect(result).toContain('<b>Fingerprint:</b>');
    });
  });

  describe('formatDedupSummary', () => {
    it('должен содержать сервис, environment, repeatCount и fingerprint', () => {
      const result = formatter.formatDedupSummary({
        serviceName: 'LogHub API',
        serviceSlug: 'loghub-api',
        environment: 'production',
        level: 'ERROR',
        message: 'DB connection error',
        repeatCount: 47,
        windowSeconds: 180,
        fingerprint:
          'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      });

      expect(result).toContain('⚠️');
      expect(result).toContain('ERROR повторился ещё 47 раз за 3 мин');
      expect(result).toContain('<b>LogHub API</b> · <code>loghub-api</code> · production');
      expect(result).toContain('<b>Сообщение:</b> 🔴 DB connection error');
      expect(result).toContain('<b>Fingerprint:</b> <code>abcdef12</code>');
    });
  });

  describe('formatWelcomeMessage', () => {
    it('должен соответствовать новому шаблону', () => {
      const result = formatter.formatWelcomeMessage('My Service', 'my-svc');

      expect(result).toContain('🔧 <b>Топик подключён</b>');
      expect(result).toContain('<b>Сервис:</b> My Service');
      expect(result).toContain('<b>Slug:</b> <code>my-svc</code>');
      expect(result).toContain('summary дедупликации');
    });
  });
});
