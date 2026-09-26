import { describe, expect, it, vi } from 'vitest';
import { CliError } from '../src/utils/errors';
import {
  describeCommand,
  initCommand,
  profileCommand,
  verifyCommand,
} from '../src/deprecated';
import { createProgram } from '../src/cli';

describe('deprecated commands', () => {
  it('rejects init, profile, describe, and verify with a replacement', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(() => initCommand()).toThrow(CliError);
    expect(() => profileCommand()).toThrow(/lepper record/);
    expect(() => describeCommand()).toThrow(/lepper map/);
    expect(() => verifyCommand()).toThrow(/lepper map/);
  });

  it('registers the agent commands and keeps old names as deprecated', () => {
    const names = createProgram()
      .commands.map((command) => command.name())
      .sort();

    expect(names).toEqual(
      [
        'blast',
        'check',
        'codemap',
        'describe',
        'diary',
        'find',
        'init',
        'map',
        'mcp',
        'preflight',
        'profile',
        'record',
        'rule',
        'sync',
        'todo',
        'verify',
      ].sort(),
    );
  });
});
