import chalk from 'chalk';
import { Log } from '../lib/helper';
import { CliError } from '../lib/errors';
import { readInfo } from '../lib/info';
import { findUndescribedDirectories } from '../lib/scan';

const verifyCommand = (cwd: string = process.cwd()): void => {
  const lepperData = readInfo(cwd);
  const undescribedDirectories = findUndescribedDirectories(
    cwd,
    lepperData.directories,
  );

  if (undescribedDirectories.length === 0) {
    Log(chalk.green('All directories are described.'));
    return;
  }

  Log(chalk.red('Undescribed directories:'));
  undescribedDirectories.forEach((directory) => {
    Log(chalk.yellow(directory));
  });

  throw new CliError(
    `Found ${undescribedDirectories.length} undescribed director${
      undescribedDirectories.length === 1 ? 'y' : 'ies'
    }.`,
    1,
    true,
  );
};

export default verifyCommand;
