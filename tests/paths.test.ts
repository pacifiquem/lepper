import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { CliError } from '../src/lib/errors';
import {
  isIgnoredDirName,
  normalizeDirectoryMap,
  normalizeProjectPath,
  readIgnoredDirNames,
} from '../src/lib/paths';

const cwd = path.join('/tmp', 'lepper-project');

describe('normalizeProjectPath', () => {
  it('normalizes relative, dotted, trailing-slash, and absolute paths', () => {
    expect(normalizeProjectPath('src', cwd)).toBe('./src');
    expect(normalizeProjectPath('./src', cwd)).toBe('./src');
    expect(normalizeProjectPath('src/', cwd)).toBe('./src');
    expect(normalizeProjectPath('./src/', cwd)).toBe('./src');
    expect(normalizeProjectPath(path.join(cwd, 'src'), cwd)).toBe('./src');
  });

  it('normalizes nested paths and parent segments', () => {
    expect(normalizeProjectPath('src/commands', cwd)).toBe('./src/commands');
    expect(normalizeProjectPath('./src/../src/lib', cwd)).toBe('./src/lib');
    expect(normalizeProjectPath('src/lib/../commands/', cwd)).toBe(
      './src/commands',
    );
  });

  it('normalizes the project root', () => {
    expect(normalizeProjectPath('.', cwd)).toBe('.');
    expect(normalizeProjectPath(cwd, cwd)).toBe('.');
  });

  it('keeps paths that resolve outside the project', () => {
    expect(normalizeProjectPath('../other', cwd)).toBe('../other');
  });

  it('rejects empty paths', () => {
    expect(() => normalizeProjectPath('', cwd)).toThrow(CliError);
    expect(() => normalizeProjectPath('   ', cwd)).toThrow(CliError);
  });
});

describe('normalizeDirectoryMap', () => {
  it('rewrites mixed path keys to the same canonical form', () => {
    const map = normalizeDirectoryMap(
      {
        src: 'relative',
        './tests': 'dotted',
        [path.join(cwd, 'src', 'lib')]: 'absolute',
      },
      cwd,
    );

    expect(map).toEqual({
      './src': 'relative',
      './tests': 'dotted',
      './src/lib': 'absolute',
    });
  });

  it('returns an empty object when directories are missing', () => {
    expect(normalizeDirectoryMap(undefined, cwd)).toEqual({});
  });
});

describe('isIgnoredDirName', () => {
  it('ignores hidden directories and node_modules', () => {
    expect(isIgnoredDirName('.git')).toBe(true);
    expect(isIgnoredDirName('.lepper')).toBe(true);
    expect(isIgnoredDirName('.husky')).toBe(true);
    expect(isIgnoredDirName('node_modules')).toBe(true);
    expect(isIgnoredDirName('src')).toBe(false);
    expect(isIgnoredDirName('tests')).toBe(false);
  });

  it('honors extra ignored names from gitignore', () => {
    const extra = new Set(['compiled', 'dist']);
    expect(isIgnoredDirName('compiled', extra)).toBe(true);
    expect(isIgnoredDirName('src', extra)).toBe(false);
  });

  it('reads simple directory names from .gitignore', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'lepper-ignore-'));
    fs.writeFileSync(
      path.join(cwd, '.gitignore'),
      ['# build', '/compiled', 'dist/', 'coverage', '*.log', 'src/tmp'].join(
        '\n',
      ),
    );

    const ignored = readIgnoredDirNames(cwd);
    expect(ignored.has('node_modules')).toBe(true);
    expect(ignored.has('compiled')).toBe(true);
    expect(ignored.has('dist')).toBe(true);
    expect(ignored.has('coverage')).toBe(true);
    expect(ignored.has('src')).toBe(false);
    expect(ignored.has('tmp')).toBe(false);

    fs.rmSync(cwd, { recursive: true, force: true });
  });
});
