import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import profileCommand from '../src/commands/profile';
import { CliError, NOT_INITIALIZED } from '../src/lib/errors';
import { readInfo } from '../src/lib/info';
import { createTempDir, mkdirp, removeTempDir, writeInfoFile } from './helpers';

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
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

function initialized(cwd: string): void {
  writeInfoFile(cwd, {
    name: 'demo',
    description: 'A demo',
    version: '1.0.0',
    author: 'tester',
    directories: {},
  });
}

describe('profileCommand', () => {
  it('stores a normalized path when -f is a relative folder', async () => {
    const cwd = temp();
    initialized(cwd);
    mkdirp(cwd, 'src');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await profileCommand('src', cwd, async () => ({
      description: 'Source code',
    }));

    expect(readInfo(cwd).directories).toEqual({
      './src': 'Source code',
    });
  });

  it('stores the same key for ./prefixed, trailing-slash, and absolute -f values', async () => {
    const cwd = temp();
    initialized(cwd);
    mkdirp(cwd, 'src/lib');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await profileCommand('./src/lib/', cwd, async () => ({
      description: 'helpers',
    }));
    expect(readInfo(cwd).directories['./src/lib']).toBe('helpers');

    await profileCommand(path.join(cwd, 'src', 'lib'), cwd, async () => ({
      description: 'shared libraries',
    }));
    expect(readInfo(cwd).directories).toEqual({
      './src/lib': 'shared libraries',
    });
  });

  it('does not exit with code 1 after a successful -f profile', async () => {
    const cwd = temp();
    initialized(cwd);
    mkdirp(cwd, 'tests');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      profileCommand('tests', cwd, async () => ({
        description: 'Unit tests',
      })),
    ).resolves.toBeUndefined();

    expect(String(log.mock.calls.at(-1)?.[0])).toContain('set successfully');
  });

  it('asks for a directory when -f is omitted and still succeeds', async () => {
    const cwd = temp();
    initialized(cwd);
    mkdirp(cwd, 'src');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await profileCommand(undefined, cwd, async (questions) => {
      const name = Array.isArray(questions)
        ? (questions[0] as { name?: string }).name
        : undefined;

      if (name === 'directory') {
        return { directory: 'src' };
      }

      return { description: 'Source' };
    });

    expect(readInfo(cwd).directories).toEqual({ './src': 'Source' });
  });

  it('fails with exit code 1 when the prompted directory is empty', async () => {
    const cwd = temp();
    initialized(cwd);

    try {
      await profileCommand(undefined, cwd, async () => ({ directory: '  ' }));
      throw new Error('expected profile to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toBe("Directory can't be empty.");
      expect((error as CliError).exitCode).toBe(1);
    }
  });

  it('fails with exit code 1 when the folder does not exist', async () => {
    const cwd = temp();
    initialized(cwd);

    await expect(
      profileCommand('missing', cwd, async () => ({ description: 'nope' })),
    ).rejects.toMatchObject({
      name: 'CliError',
      exitCode: 1,
      message: 'Directory does not exist: ./missing',
    });
  });

  it('fails with exit code 1 when lepper is not initialized', async () => {
    const cwd = temp();

    await expect(
      profileCommand('src', cwd, async () => ({ description: 'Source' })),
    ).rejects.toMatchObject({
      name: 'CliError',
      exitCode: 1,
      message: NOT_INITIALIZED,
    });
  });
});
