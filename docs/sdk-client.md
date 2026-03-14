# SDK Client (@besales/loghub-client)

## Назначение

NPM-пакет `@besales/loghub-client` — лёгкий TypeScript-клиент для отправки логов в LogHub из любого Node.js-сервиса (>= 18). Ноль внешних зависимостей — только нативный `fetch`.

## Расположение

```
packages/loghub-client/
├── src/
│   └── index.ts              # Единственный файл с полной реализацией
├── dist/                     # Сборка (не коммитится)
├── package.json
├── tsconfig.json             # Для IDE (extends tsconfig.build.json)
├── tsconfig.build.json       # Конфигурация сборки
├── .gitignore
├── LICENSE                   # MIT
└── README.md                 # Документация для npm
```

## Публичное API

| Экспорт | Тип | Описание |
|---------|-----|----------|
| `LogHubClient` | class | Основной клиент для отправки логов |
| `LogHubApiError` | class | Ошибка API (statusCode + responseBody) |
| `LogLevel` | enum | DEBUG, INFO, WARN, ERROR, FATAL |
| `LogHubClientOptions` | interface | Параметры конструктора |
| `LogOptions` | interface | Опции отправки (stackTrace, metadata) |
| `LogResponse` | interface | Ответ сервера (id, fingerprint, deduplicated) |

## Архитектура

- **Один файл** — `src/index.ts` содержит все типы, класс клиента и ошибку
- **Zero deps** — нет зависимостей, только нативный `fetch` и `AbortController`
- **CommonJS** — `module: "commonjs"` для совместимости с NestJS/Express
- **Декларации** — `declaration: true` + `declarationMap: true` для TypeScript consumers

## Retry-стратегия

| Тип ошибки | Поведение |
|------------|-----------|
| 5xx (серверные) | Retry с exponential backoff: `retryDelay * 2^attempt` |
| Сетевые ошибки | Retry с exponential backoff |
| 4xx (клиентские) | Бросается сразу — retry бессмысленен |
| Таймаут | Retry (AbortController timeout → сетевая ошибка) |

После исчерпания попыток: `onError(error)` → `throw error`.

## Конфигурация

| Параметр | Тип | По умолчанию |
|----------|-----|-------------|
| `endpoint` | `string` | — (обязательный) |
| `apiKey` | `string` | — (обязательный) |
| `timeout` | `number` | 5000 мс |
| `retries` | `number` | 2 |
| `retryDelay` | `number` | 1000 мс |
| `onError` | `(error: Error) => void` | `console.error` |

## Тестирование

```bash
yarn jest test/unit/loghub-client.spec.ts
```

24 теста: конструктор, log(), shorthand-методы, retry, timeout, onError, LogHubApiError.

## Публикация

```bash
cd packages/loghub-client
yarn build        # tsc -p tsconfig.build.json → dist/
npm publish       # публикация на npm (scope @besales)
```

`prepublishOnly` хук автоматически вызывает `yarn build` перед `npm publish`.

## Связанные модули

- `core/ingestion` — серверная сторона: `POST /api/logs/ingest` (endpoint, на который отправляет SDK)
- `shared/guards/api-key.guard.ts` — валидация `X-API-Key` заголовка на сервере
- `shared/enums/log-level.enum.ts` — серверный enum `LogLevel` (дублируется в SDK)
