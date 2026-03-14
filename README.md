# LogHub

Centralized microservice for collecting, deduplicating, and publishing error logs from external services to a Telegram Forum group.

External services send logs via `POST /api/logs/ingest` with an API key. Each service gets its own topic in a Telegram Forum (created automatically on first error). Duplicates within a 3-minute window are suppressed with a summary message. All logs are stored in PostgreSQL.

## Stack

- **Runtime**: NestJS 11 + Fastify, TypeScript 5
- **Database**: PostgreSQL 16 via Prisma 6
- **Cache / Dedup**: Redis 7 (ioredis)
- **Notifications**: Telegram Bot API (native fetch)
- **Hosting**: Railway (Docker multi-stage build)

## Getting Started

```bash
# Install dependencies
yarn install

# Copy env file and fill in values
cp .env.example .env

# Run migrations and generate Prisma client
yarn db:migrate
yarn db:generate

# Start development server (port 3000)
yarn dev
```

Swagger UI is available at `http://localhost:3000/api/docs` in development mode.

## API

### Ingestion (external services)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/logs/ingest` | `X-API-Key` | Submit an error log |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/admin/login` | — | Login, returns JWT cookie |
| `POST` | `/api/admin/logout` | Cookie | Logout |
| `GET` | `/api/admin/services` | Cookie | List services |
| `POST` | `/api/admin/services` | Cookie | Create service |
| `PATCH` | `/api/admin/services/:id` | Cookie | Update service |
| `DELETE` | `/api/admin/services/:id` | Cookie | Delete service |
| `POST` | `/api/admin/services/:id/regenerate-key` | Cookie | Regenerate API key |
| `GET` | `/api/admin/logs` | Cookie | Query logs (filters + pagination) |
| `GET` | `/api/health` | — | Health check |

## SDK Client

A zero-dependency TypeScript client for integrating LogHub into other services:

```bash
yarn add @besales/loghub-client
```

```typescript
import { LogHubClient } from '@besales/loghub-client';

const loghub = new LogHubClient({
  endpoint: 'https://your-loghub.railway.app',
  apiKey: 'sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
});

await loghub.error('Database connection failed', {
  stackTrace: err.stack,
  metadata: { userId: 'usr_123' },
});
```

See [`packages/loghub-client/README.md`](packages/loghub-client/README.md) for the full SDK documentation.

## Commands

```bash
yarn dev              # Start dev server (port 3000, watch mode)
yarn build            # Production build
yarn start:prod       # Start production server

yarn db:generate      # Generate Prisma client
yarn db:migrate       # Create and apply migration
yarn db:migrate:prod  # Apply migrations (production)
yarn db:seed          # Seed database (creates test service)

yarn test             # Unit tests
yarn test:cov         # Tests with coverage
yarn test:e2e         # E2E tests

yarn lint             # ESLint check
yarn lint:fix         # ESLint with auto-fix
```

## Deployment

Deployed on Railway using a Docker multi-stage build. See [`docs/deployment.md`](docs/deployment.md) for the full deployment guide, including environment variables and step-by-step Railway setup.

## Documentation

| File | Description |
|------|-------------|
| [`docs/deployment.md`](docs/deployment.md) | Railway deployment, env vars, Docker |
| [`docs/integration-guide.md`](docs/integration-guide.md) | How to integrate LogHub into other services |
| [`docs/admin.md`](docs/admin.md) | Admin API reference |
| [`docs/ingestion.md`](docs/ingestion.md) | Ingestion flow |
| [`docs/dedup.md`](docs/dedup.md) | Deduplication logic |
| [`docs/telegram.md`](docs/telegram.md) | Telegram integration |
| [`docs/sdk-client.md`](docs/sdk-client.md) | SDK internals |
