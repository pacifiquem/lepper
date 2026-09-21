import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { CliError, NOT_INITIALIZED } from '../src/lib/errors';
import {
  createProjectInfo,
  isInitialized,
  readInfo,
  writeInfo,
} from '../src/lib/info';
import { createTempDir, mkdirp, removeTempDir, writeInfoFile } from './helpers';

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

describe('createProjectInfo', () => {
  it('saves the project description and starts with no directories', () => {
    expect(
      createProjectInfo({
        name: 'lepper',
        description: 'Describe project structure',
        version: '1.0.0',
        author: 'tester',
      }),
    ).toEqual({
      name: 'lepper',
      description: 'Describe project structure',
      version: '1.0.0',
      author: 'tester',
      directories: {},
    });
  });
});

describe('readInfo and writeInfo', () => {
  it('throws a friendly error when lepper is not initialized', () => {
    const cwd = temp();
    expect(() => readInfo(cwd)).toThrow(CliError);
    expect(() => readInfo(cwd)).toThrow(NOT_INITIALIZED);
  });

  it('throws a friendly error when .lepper exists without _info.json', () => {
    const cwd = temp();
    mkdirp(cwd, '.lepper');
    expect(isInitialized(cwd)).toBe(false);
    expect(() => readInfo(cwd)).toThrow(NOT_INITIALIZED);
  });

  it('throws a friendly error for an empty _info.json', () => {
    const cwd = temp();
    writeInfoFile(cwd, {}, '');
    expect(() => readInfo(cwd)).toThrow(CliError);
    expect(() => readInfo(cwd)).toThrow(/file is empty/);
  });

  it('throws a friendly error for invalid JSON instead of a raw stack', () => {
    const cwd = temp();
    writeInfoFile(cwd, {}, '{not json');

    let thrown: unknown;
    try {
      readInfo(cwd);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CliError);
    expect((thrown as CliError).message).toMatch(
      /Failed to read \.lepper\/_info\.json/,
    );
    expect((thrown as CliError).message).not.toMatch(/\n\s+at\s+/);
    expect((thrown as CliError).exitCode).toBe(1);
  });

  it('throws a friendly error when JSON is null', () => {
    const cwd = temp();
    writeInfoFile(cwd, {}, 'null');
    expect(() => readInfo(cwd)).toThrow(/expected a JSON object/);
  });

  it('treats a missing directories field as an empty map', () => {
    const cwd = temp();
    writeInfoFile(cwd, {
      name: 'demo',
      description: 'A demo',
      version: '0.0.1',
      author: 'me',
    });

    expect(readInfo(cwd).directories).toEqual({});
  });

  it('normalizes stored directory keys on read and write', () => {
    const cwd = temp();
    mkdirp(cwd, 'src/lib');
    writeInfo(cwd, {
      name: 'demo',
      description: 'A demo',
      directories: {
        src: 'source',
        [path.join(cwd, 'src', 'lib')]: 'helpers',
      },
    });

    const saved = JSON.parse(
      fs.readFileSync(path.join(cwd, '.lepper', '_info.json'), 'utf-8'),
    ) as { directories: Record<string, string> };

    expect(saved.directories).toEqual({
      './src': 'source',
      './src/lib': 'helpers',
    });
    expect(readInfo(cwd).directories).toEqual(saved.directories);
  });
});
