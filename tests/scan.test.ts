import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectDirectories,
  findUndescribedDirectories,
} from '../src/notes/directories';
import { createTempDir, mkdirp, removeTempDir } from './helpers';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

function temp(): string {
  const dir = createTempDir();
  dirs.push(dir);
  return dir;
}

describe('collectDirectories', () => {
  it('walks nested directories and skips hidden and node_modules folders', () => {
    const cwd = temp();
    mkdirp(cwd, 'src/commands');
    mkdirp(cwd, 'src/lib');
    mkdirp(cwd, 'tests');
    mkdirp(cwd, '.git/objects');
    mkdirp(cwd, '.lepper');
    mkdirp(cwd, 'node_modules/chalk');

    expect(collectDirectories(cwd)).toEqual([
      './src',
      './src/commands',
      './src/lib',
      './tests',
    ]);
  });

  it('skips gitignored build directories such as compiled', () => {
    const cwd = temp();
    mkdirp(cwd, 'src');
    mkdirp(cwd, 'compiled/bin');
    mkdirp(cwd, 'dist/out');
    fs.writeFileSync(path.join(cwd, '.gitignore'), '/compiled\n/dist\n');

    expect(collectDirectories(cwd)).toEqual(['./src']);
  });
});

describe('findUndescribedDirectories', () => {
  it('does not flag described directories when stored keys use mixed path forms', () => {
    const cwd = temp();
    mkdirp(cwd, 'src/lib');
    mkdirp(cwd, 'tests');

    const undescribed = findUndescribedDirectories(cwd, {
      './src': 'source',
      [path.join(cwd, 'src', 'lib')]: 'helpers',
      tests: 'specs',
    });

    expect(undescribed).toEqual([]);
  });

  it('lists only directories that have no description', () => {
    const cwd = temp();
    mkdirp(cwd, 'src');
    mkdirp(cwd, 'tests');
    mkdirp(cwd, 'docs');

    expect(
      findUndescribedDirectories(cwd, {
        './src': 'source',
        './tests': 'specs',
      }),
    ).toEqual(['./docs']);
  });
});
