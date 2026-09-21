import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { createProgram } from '../src/cli';

describe('createProgram', () => {
  it('maps profile -f to the folder option', () => {
    const profile = createProgram().commands.find(
      (command) => command.name() === 'profile',
    );
    const option = profile?.options.find(
      (item) => item.attributeName() === 'folder',
    );

    expect(option?.short).toBe('-f');
    expect(option?.long).toBe('--folder');
  });

  it('registers init, profile, verify, and describe', () => {
    const names = createProgram()
      .commands.map((command) => command.name())
      .sort();

    expect(names).toEqual(['describe', 'init', 'profile', 'verify']);
  });
});

describe('commander folder option contract', () => {
  it('passes -f through as options.folder rather than a Command instance', async () => {
    let received: unknown;
    const program = new Command();
    program
      .command('profile')
      .option('-f, --folder <path>', 'Specify folder to set description for')
      .action((options: { folder?: string }) => {
        received = options.folder;
      });

    await program.parseAsync(['profile', '-f', 'src'], { from: 'user' });
    expect(received).toBe('src');
  });
});
