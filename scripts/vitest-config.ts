import { defineConfig } from 'vitest/config';

const SHARED_EXCLUDE = ['node_modules', 'dist'];
const INTEGRATION_TEST_FILES = 'src/**/*.integration.test.ts';
const SEMI_AUTOMATIC_TEST_FILES = 'src/**/*.semi-automatic.test.ts';
const BIG_TIMEOUT_IN_MILLISECONDS = 30_000;
const SEMI_AUTOMATIC_TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

export const config = defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/**/*.test.ts'
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage'
    },
    exclude: ['node_modules', 'dist'],
    globals: false,
    include: ['src/**/*.test.ts'],
    projects: [
      {
        resolve: {
          alias: {
            obsidian: 'obsidian-test-mocks/obsidian'
          }
        },
        ssr: {
          noExternal: ['obsidian-dev-utils', 'obsidian-typings']
        },
        test: {
          environment: 'jsdom',
          exclude: [...SHARED_EXCLUDE, INTEGRATION_TEST_FILES, SEMI_AUTOMATIC_TEST_FILES],
          include: ['src/**/*.test.ts'],
          name: 'unit-tests',
          setupFiles: ['obsidian-test-mocks/setup']
        }
      },
      {
        test: {
          environment: 'node',
          exclude: [...SHARED_EXCLUDE, SEMI_AUTOMATIC_TEST_FILES],
          fileParallelism: false,
          globalSetup: 'obsidian-integration-testing/obsidian-plugin-vitest-setup',
          include: [INTEGRATION_TEST_FILES],
          name: 'integration-tests',
          testTimeout: BIG_TIMEOUT_IN_MILLISECONDS
        }
      },
      {
        test: {
          environment: 'node',
          fileParallelism: false,
          include: [SEMI_AUTOMATIC_TEST_FILES],
          name: 'semi-automatic-tests',
          testTimeout: SEMI_AUTOMATIC_TEST_TIMEOUT_IN_MILLISECONDS
        }
      }
    ]
  }
});
