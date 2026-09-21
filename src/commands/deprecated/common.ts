import chalk from 'chalk';
import { CliError } from '../../lib/errors';
import { Log } from '../../lib/helper';

const DEPRECATED =
  'Manual directory descriptions are deprecated. AI agents should use record, map, find, and todo.';

export function deprecatedCommand(oldName: string, replacement: string): never {
  Log(chalk.yellow(DEPRECATED));
  throw new CliError(
    `\`${oldName}\` is deprecated. Use \`${replacement}\` instead.`,
  );
}
