import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import initCommand from '../src/commands/init';
import { CliError } from '../src/lib/errors';
import { isInitialized, readInfo } from '../src/lib/info';
import { createTempDir, mkdirp, removeTempDir } from './helpers';

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

const answers = {
  name: 'lepper',
  description: 'Understand project structure',
  version: '0.0.1',
  author: 'tester',
  isInfoCorrect: 'Yes',
};

describe('initCommand', () => {
  it('saves the project description into _info.json', async () => {
    const cwd = temp();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await initCommand(cwd, async () => answers);

    expect(isInitialized(cwd)).toBe(true);
    expect(readInfo(cwd)).toEqual({
      name: 'lepper',
      description: 'Understand project structure',
      version: '0.0.1',
      author: 'tester',
      directories: {},
    });
    expect(String(log.mock.calls.at(-1)?.[0])).toContain(
      'initialized successfully',
    );
  });

  it('does not create .lepper when the prompt is interrupted', async () => {
    const cwd = temp();
    const cancel = Object.assign(new Error('User force closed the prompt'), {
      name: 'ExitPromptError',
    });

    await expect(
      initCommand(cwd, async () => {
        throw cancel;
      }),
    ).rejects.toMatchObject({ name: 'ExitPromptError' });

    expect(fs.existsSync(path.join(cwd, '.lepper'))).toBe(false);
    expect(isInitialized(cwd)).toBe(false);
  });

  it('reuses a leftover empty .lepper directory instead of failing with already exists', async () => {
    const cwd = temp();
    mkdirp(cwd, '.lepper');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await initCommand(cwd, async () => answers);

    expect(isInitialized(cwd)).toBe(true);
    expect(readInfo(cwd).description).toBe('Understand project structure');
  });

  it('exits with a detectable error when already initialized', async () => {
    const cwd = temp();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await initCommand(cwd, async () => answers);

    try {
      await initCommand(cwd, async () => answers);
      throw new Error('expected init to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toBe(
        'Lepper directory already exists.',
      );
      expect((error as CliError).exitCode).toBe(1);
    }
  });

  it('re-prompts when the user says the information is not correct', async () => {
    const cwd = temp();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const prompt = vi
      .fn()
      .mockResolvedValueOnce({ ...answers, isInfoCorrect: 'No' })
      .mockResolvedValueOnce({
        ...answers,
        description: 'Revised description',
        isInfoCorrect: 'Yes',
      });

    await initCommand(cwd, prompt);

    expect(prompt).toHaveBeenCalledTimes(2);
    expect(readInfo(cwd).description).toBe('Revised description');
  });
});
