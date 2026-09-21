import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CliError,
  formatCliFailure,
  handleError,
  isCancelError,
} from '../src/lib/errors';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatCliFailure', () => {
  it('preserves CliError exit codes and printed state', () => {
    const error = new CliError('already shown', 1, true);
    expect(formatCliFailure(error)).toEqual({
      message: 'already shown',
      exitCode: 1,
      alreadyPrinted: true,
    });
  });

  it('uses the syntax error message without a stack trace', () => {
    const failure = formatCliFailure(
      new SyntaxError('Unexpected end of JSON input'),
    );

    expect(failure.exitCode).toBe(1);
    expect(failure.message).toBe('Unexpected end of JSON input');
    expect(failure.message).not.toMatch(/\n\s+at\s+/);
  });

  it('uses the error message of generic errors, not the stack trace', () => {
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at Object.<anonymous> (file.ts:1:1)';

    expect(formatCliFailure(error)).toEqual({
      message: 'boom',
      exitCode: 1,
      alreadyPrinted: false,
    });
  });

  it('maps cancelled prompts to a friendly failure', () => {
    const error = Object.assign(new Error('User force closed the prompt'), {
      name: 'ExitPromptError',
    });

    expect(isCancelError(error)).toBe(true);
    expect(formatCliFailure(error)).toEqual({
      message: 'Cancelled.',
      exitCode: 1,
      alreadyPrinted: false,
    });
  });
});

describe('handleError', () => {
  it('prints red text and exits with code 1', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`exit:${code}`);
    }) as typeof process.exit);

    expect(() => handleError(new CliError('not initialized'))).toThrow(
      'exit:1',
    );
    expect(log).toHaveBeenCalled();
    expect(String(log.mock.calls[0]?.[0])).toContain('not initialized');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('does not print a second message when the command already printed the failure', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as typeof process.exit);

    expect(() =>
      handleError(new CliError('Found 2 undescribed directories.', 1, true)),
    ).toThrow('exit:1');
    expect(log).not.toHaveBeenCalled();
  });
});
