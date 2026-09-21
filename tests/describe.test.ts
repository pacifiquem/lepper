import { afterEach, describe, expect, it, vi } from 'vitest';
import describeCommand from '../src/commands/describe';
import { CliError, NOT_INITIALIZED } from '../src/lib/errors';
import { createTempDir, removeTempDir, writeInfoFile } from './helpers';

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

describe('describeCommand', () => {
  it('does not crash when directories is missing on an empty project', () => {
    const cwd = temp();
    writeInfoFile(cwd, {
      name: 'demo',
      description: 'A demo',
      version: '1.0.0',
      author: 'tester',
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const table = vi
      .spyOn(console, 'table')
      .mockImplementation(() => undefined);

    expect(() => describeCommand(cwd)).not.toThrow();
    expect(table).not.toHaveBeenCalled();
    expect(String(log.mock.calls.at(-1)?.[0])).toContain(
      'No directory descriptions found',
    );
  });

  it('does not crash when directories is null', () => {
    const cwd = temp();
    writeInfoFile(cwd, {
      name: 'demo',
      directories: null,
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(() => describeCommand(cwd)).not.toThrow();
  });

  it('prints a table of described directories', () => {
    const cwd = temp();
    writeInfoFile(cwd, {
      name: 'demo',
      directories: {
        './src': 'Source code',
        tests: 'Unit tests',
      },
    });
    const table = vi
      .spyOn(console, 'table')
      .mockImplementation(() => undefined);

    describeCommand(cwd);

    expect(table).toHaveBeenCalledWith([
      { Directories: './src', Description: 'Source code' },
      { Directories: './tests', Description: 'Unit tests' },
    ]);
  });

  it('fails with exit code 1 when not initialized', () => {
    const cwd = temp();

    try {
      describeCommand(cwd);
      throw new Error('expected describe to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toBe(NOT_INITIALIZED);
      expect((error as CliError).exitCode).toBe(1);
    }
  });

  it('fails with a friendly message when _info.json is invalid', () => {
    const cwd = temp();
    writeInfoFile(cwd, {}, '{');

    try {
      describeCommand(cwd);
      throw new Error('expected describe to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toMatch(
        /Failed to read \.lepper\/_info\.json/,
      );
      expect((error as CliError).message).not.toMatch(/\n\s+at\s+/);
      expect((error as CliError).exitCode).toBe(1);
    }
  });
});
