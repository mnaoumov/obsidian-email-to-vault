import { relative } from 'node:path';
import process from 'node:process';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { lint } from 'obsidian-dev-utils/script-utils/linters/markdownlint';

const [, , ...rawPaths] = process.argv;
const paths = rawPaths.map((p) => relative(process.cwd(), p).replace(/\\/g, '/') || p);

await wrapCliTask(() => lint({ paths }));
