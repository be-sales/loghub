import { LogLevel } from '@shared/enums/log-level.enum';

/**
 * Входные данные для записи лога (из DTO после валидации).
 */
export interface LogEntryInput {
  /** Уровень ошибки */
  level: LogLevel;
  /** Текст ошибки */
  message: string;
  /** Stack trace (опционально) */
  stackTrace?: string | null;
  /** Произвольные метаданные */
  metadata?: Record<string, unknown> | null;
}

/**
 * Ответ на запрос приёма лога.
 */
export interface IngestResponse {
  /** Идентификатор созданного лога */
  id: string;
  /** SHA-256 fingerprint ошибки */
  fingerprint: string;
  /** Был ли лог дедуплицирован (true = дубликат, Telegram не отправлен) */
  deduplicated: boolean;
}
