import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/main.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@besales/loghub-client$': '<rootDir>/packages/loghub-client/src/index',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@admin/(.*)$': '<rootDir>/src/admin/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    // Паттерн специфичен: ^@prisma/prisma\. предотвращает перехват @prisma/client из node_modules
    '^@prisma/prisma\\.(.*)$': '<rootDir>/src/prisma/prisma.$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@redis/(.*)$': '<rootDir>/src/redis/$1',
    '^@transport/(.*)$': '<rootDir>/src/transport/$1',
    '^@integrations/(.*)$': '<rootDir>/src/integrations/$1',
    '^@memory/(.*)$': '<rootDir>/src/memory/$1',
  },
};

export default config;
