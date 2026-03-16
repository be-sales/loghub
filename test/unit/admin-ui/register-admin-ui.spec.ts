import fastify from 'fastify';
import { join } from 'node:path';
import {
  ADMIN_UI_ASSETS_ROUTE_PREFIX,
  ADMIN_UI_ROUTE,
  registerAdminUiRoutes,
} from '@admin-ui/register-admin-ui';

const fixtureRoot = join(process.cwd(), 'test', 'fixtures', 'admin-ui', 'public');

describe('registerAdminUiRoutes', () => {
  it('должен отдавать HTML shell по /admin и /admin/', async () => {
    const app = fastify();
    await registerAdminUiRoutes(app, { rootDir: fixtureRoot });

    const response = await app.inject({
      method: 'GET',
      url: ADMIN_UI_ROUTE,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Fixture Admin UI');

    const trailingSlashResponse = await app.inject({
      method: 'GET',
      url: `${ADMIN_UI_ROUTE}/`,
    });

    expect(trailingSlashResponse.statusCode).toBe(200);
    await app.close();
  });

  it('должен отдавать статические ассеты по /admin-assets/*', async () => {
    const app = fastify();
    await registerAdminUiRoutes(app, { rootDir: fixtureRoot });

    const jsResponse = await app.inject({
      method: 'GET',
      url: `${ADMIN_UI_ASSETS_ROUTE_PREFIX}app.js`,
    });

    expect(jsResponse.statusCode).toBe(200);
    expect(jsResponse.body).toContain('fixture admin ui bundle');

    const cssResponse = await app.inject({
      method: 'GET',
      url: `${ADMIN_UI_ASSETS_ROUTE_PREFIX}styles.css`,
    });

    expect(cssResponse.statusCode).toBe(200);
    expect(cssResponse.body).toContain('font-family');
    await app.close();
  });
});
