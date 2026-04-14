import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { testCoverage } from 'obsidian-dev-utils/script-utils/test-runners/vitest';

const MIN_COVERAGE_IN_PERCENTS = 100;

await wrapCliTask(() =>
  testCoverage({
    minCoverageInPercents: MIN_COVERAGE_IN_PERCENTS,
    projects: ['unit-tests']
  })
);
