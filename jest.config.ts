import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { useESM: true, tsconfig: { ...tsconfig?.compilerOptions, module: 'nodenext', moduleResolution: 'nodenext', target: 'es2023', emitDecoratorMetadata: true, experimentalDecorators: true } }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(?:@nestjs|rxjs|tslib|class-transformer|class-validator|uuid|ioredis|axios|@prisma|argon2|bullmq)/)',
  ],
  moduleNameMapper: {
    ...pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', 'libs/**/*.(t|j)s', 'apps/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};

export default config;
