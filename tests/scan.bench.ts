import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, bench, describe } from 'vitest';
import { findUndescribedDirectories } from '../src/lib/scan';

let cwd = '';
const described: Record<string, string> = {};

function buildTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lepper-bench-'));

  for (let i = 0; i < 40; i += 1) {
    const group = path.join(root, `group-${i}`);
    fs.mkdirSync(group);
    described[`./group-${i}`] = `group ${i}`;

    for (let j = 0; j < 5; j += 1) {
      const child = path.join(group, `child-${j}`);
      fs.mkdirSync(child);
      if (j % 2 === 0) {
        described[`./group-${i}/child-${j}`] = `child ${j}`;
      }
    }
  }

  fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git', 'objects'), { recursive: true });

  return root;
}

describe('findUndescribedDirectories', () => {
  beforeAll(() => {
    cwd = buildTree();
  });

  afterAll(() => {
    if (cwd) {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  bench('scan a nested project tree with mixed described paths', () => {
    findUndescribedDirectories(cwd, described);
  });
});
