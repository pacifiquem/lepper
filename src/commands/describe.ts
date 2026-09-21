import chalk from 'chalk';
import { Log } from '../lib/helper';
import { readInfo } from '../lib/info';

const describeCommand = (cwd: string = process.cwd()): void => {
  const lepperData = readInfo(cwd);
  const directories = lepperData.directories || {};
  const entries = Object.entries(directories);

  if (entries.length === 0) {
    Log(
      chalk.yellow(
        'No directory descriptions found. Use "lepper profile" to add some.',
      ),
    );
    return;
  }

  const tableData = entries.map(([directory, description]) => ({
    Directories: directory,
    Description: description,
  }));

  console.table(tableData);
};

export default describeCommand;
