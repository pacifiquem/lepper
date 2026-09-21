import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import verifyCommand from '../src/commands/verify';
import { CliError, NOT_INITIALIZED } from '../src/lib/errors';
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

describe('verifyCommand', () => {
  it('does not flag described directories stored as relative ./ paths', () => {
    const cwd = temp();
    mkdirp(cwd, 'src/lib');
    mkdirp(cwd, 'tests');
    writeInfoFile(cwd, {
      name: 'demo',
      directories: {
        './src': 'source',
        './src/lib': 'helpers',
        './tests': 'specs',
      },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(() => verifyCommand(cwd)).not.toThrow();
    expect(String(log.mock.calls.at(-1)?.[0])).toContain(
      'All directories are described',
    );
  });

  it('matches absolute and unprefixed stored paths against the filesystem', () => {
    const cwd = temp();
    mkdirp(cwd, 'src');
    writeInfoFile(cwd, {
      directories: {
        [path.join(cwd, 'src')]: 'source',
      },
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(() => verifyCommand(cwd)).not.toThrow();
  });

  it('exits with code 1 when undescribed directories exist', () => {
    const cwd = temp();
    mkdirp(cwd, 'src');
    mkdirp(cwd, 'docs');
    writeInfoFile(cwd, {
      directories: {
        './src': 'source',
      },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      verifyCommand(cwd);
      throw new Error('expected verify to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).exitCode).toBe(1);
      expect((error as CliError).alreadyPrinted).toBe(true);
    }

    const output = log.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('Undescribed directories');
    expect(output).toContain('./docs');
  });

  it('fails with exit code 1 when not initialized instead of only printing red text', () => {
    const cwd = temp();

    try {
      verifyCommand(cwd);
      throw new Error('expected verify to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toBe(NOT_INITIALIZED);
      expect((error as CliError).exitCode).toBe(1);
    }
  });
});
