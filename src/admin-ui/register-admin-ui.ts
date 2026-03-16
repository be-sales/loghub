import fastifyStatic from '@fastify/static';
import { FastifyInstance, FastifyReply } from 'fastify';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const ADMIN_UI_ROUTE = '/admin';
export const ADMIN_UI_ASSETS_ROUTE_PREFIX = '/admin-assets/';

const ADMIN_UI_INDEX_FILE = 'admin/index.html';

export interface RegisterAdminUiOptions {
  rootDir?: string;
}

export async function registerAdminUiRoutes(
  app: FastifyInstance,
  options: RegisterAdminUiOptions = {},
): Promise<void> {
  const rootDir = resolveAdminUiRoot(options.rootDir);
  const indexFilePath = join(rootDir, ADMIN_UI_INDEX_FILE);

  if (!existsSync(indexFilePath)) {
    throw new Error(
      `Admin UI shell не найден: ${indexFilePath}. Сначала выполните сборку через "yarn build:admin-ui".`,
    );
  }

  await app.register(fastifyStatic, {
    root: rootDir,
    prefix: ADMIN_UI_ASSETS_ROUTE_PREFIX,
  });

  const sendAdminShell = async (_request: unknown, reply: FastifyReply) => {
    return reply.type('text/html; charset=utf-8').sendFile(ADMIN_UI_INDEX_FILE);
  };

  app.get(ADMIN_UI_ROUTE, sendAdminShell);
  app.get(`${ADMIN_UI_ROUTE}/`, sendAdminShell);
}

function resolveAdminUiRoot(rootDir?: string): string {
  return rootDir ?? join(process.cwd(), 'public');
}
