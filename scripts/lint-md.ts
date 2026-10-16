import { lint } from '@mnaoumov/obsidian-dev-toolkit/linters/markdownlint';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { relative } from 'node:path';
import process from 'node:process';

const [, , ...rawPaths] = process.argv;
const paths = rawPaths.map((p) => relative(process.cwd(), p).replaceAll('\\', '/') || p);

await wrapCliTask(() => lint({ paths }));
