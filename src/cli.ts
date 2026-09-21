import { Command } from 'commander';
import pkg from '../package.json';
import process from 'process';
import { handleError } from './lib/errors';

import initCommand from './commands/init';
import describeCommand from './commands/describe';
import profileCommand from './commands/profile';
import verifyCommand from './commands/verify';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('lepper')
    .description("Understand any project's structure easily.")
    .usage('command [options]')
    .version(
      `\x1b[1mv${pkg.version}\x1b[0m`,
      '-v, --version',
      "Output lepper's current version.",
    )
    .helpOption('-h, --help', 'Output usage of lepper');

  program
    .command('init')
    .description('Initialize lepper in your project')
    .action(async () => {
      await initCommand();
    });

  program
    .command('profile')
    .description('Set description to a directory.')
    .option('-f, --folder <path>', 'Specify folder to set description for')
    .action(async (options: { folder?: string }) => {
      await profileCommand(options.folder);
    });

  program
    .command('verify')
    .description('Verify and list undescribed folders')
    .action(() => verifyCommand());

  program
    .command('describe')
    .description("Log descriptions of the project's structure")
    .action(() => describeCommand());

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    handleError(error);
  }
}
