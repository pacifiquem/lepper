import path from 'path';
import { bench, describe } from 'vitest';
import { normalizeProjectPath } from '../src/utils/paths';

const cwd = path.join('/tmp', 'lepper-bench-project');
const absolute = path.join(cwd, 'src', 'commands');

describe('normalizeProjectPath', () => {
  bench('relative, dotted, trailing-slash, and absolute forms', () => {
    normalizeProjectPath('src/commands', cwd);
    normalizeProjectPath('./src/commands', cwd);
    normalizeProjectPath('src/commands/', cwd);
    normalizeProjectPath(absolute, cwd);
    normalizeProjectPath('./src/../src/commands', cwd);
  });
});
