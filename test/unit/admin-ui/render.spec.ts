import { renderApp } from '@admin-ui/render';
import { createInitialState } from '@admin-ui/state';
import { getMessages } from '@admin-ui/i18n';
import { AdminUiState } from '@admin-ui/types';

describe('Admin UI render', () => {
  const messages = getMessages('ru');

  it('должен рендерить login screen для неавторизованного состояния', () => {
    const state: AdminUiState = {
      ...createInitialState('ru'),
      phase: 'login',
    };

    const html = renderApp(state, messages);

    expect(html).toContain('id="login-form"');
    expect(html).toContain('Command deck для источников логов');
    expect(html).toContain('HttpOnly cookie');
  });

  it('должен рендерить dashboard со списком сервисов и карточкой reveal', () => {
    const state: AdminUiState = {
      ...createInitialState('ru'),
      phase: 'dashboard',
      services: [
        {
          id: 'svc_1',
          name: 'Payments API',
          slug: 'payments-api',
          apiKeyLast4: '42af',
          topicId: 128,
          isActive: true,
          description: 'Основной production API',
          createdAt: '2026-03-16T10:00:00.000Z',
          updatedAt: '2026-03-16T11:00:00.000Z',
          _count: { errorLogs: 17 },
        },
      ],
      reveal: {
        serviceName: 'Payments API',
        serviceSlug: 'payments-api',
        endpoint: 'https://loghub-api-production.up.railway.app',
        apiKey: 'loghub_demo_key_1234567890abcdef1234567890abcd',
        apiKeyLast4: 'abcd',
      },
      editor: { kind: 'edit', serviceId: 'svc_1' },
    };

    const html = renderApp(state, messages);

    expect(html).toContain('Payments API');
    expect(html).toContain('payments-api');
    expect(html).toContain('LOGHUB_ENDPOINT=https://loghub-api-production.up.railway.app');
    expect(html).toContain('LOGHUB_API_KEY=loghub_demo_key_1234567890abcdef1234567890abcd');
    expect(html).toContain('Regenerate key');
    expect(html).toContain('Основной production API');
  });
});
