import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@admin/(.*)$': '<rootDir>/src/admin/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@prisma/(prisma\\..*)$': '<rootDir>/src/prisma/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@redis/(.*)$': '<rootDir>/src/redis/$1',
  },
};

export default config;
