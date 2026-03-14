import { PrismaClient } from '@prisma/client';
import { createHmac, randomBytes } from 'crypto';
import { API_KEY_PREFIX, API_KEY_LENGTH } from '../src/shared/constants';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const existing = await prisma.service.findUnique({
    where: { slug: 'test-service' },
  });

  if (existing) {
    console.log(`Тестовый сервис уже существует: ${existing.name} (id: ${existing.id})`);
    console.log('Для перегенерации ключа удалите сервис и запустите seed повторно.');
    return;
  }

  const hmacSecret = process.env.HMAC_SECRET;
  if (!hmacSecret) {
    console.error('HMAC_SECRET не настроен — проверьте переменные окружения');
    process.exit(1);
  }

  const apiKey = `${API_KEY_PREFIX}${randomBytes(API_KEY_LENGTH / 2).toString('hex')}`;
  const apiKeyHash = createHmac('sha256', hmacSecret).update(apiKey).digest('hex');

  const service = await prisma.service.create({
    data: {
      name: 'Test Service',
      slug: 'test-service',
      apiKeyHash,
      apiKeyLast4: apiKey.slice(-4),
      description: 'Тестовый сервис для разработки',
    },
  });

  console.log(`Тестовый сервис создан: ${service.name} (id: ${service.id})`);
  console.log(`API key: ${apiKey}`);
  console.log('Сохраните ключ — он не будет показан повторно.');
}

main()
  .catch((error: unknown) => {
    console.error('Ошибка при seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
