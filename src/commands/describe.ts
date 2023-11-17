import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { Log } from '../lib/helper';

const describeCommand = () => {
  const lepperDirectory = path.join(process.cwd(), '.lepper');
  const infoFilePath = path.join(lepperDirectory, '_info.json');

  // Check if the .lepper directory exists
  if (!fs.existsSync(lepperDirectory)) {
    Log(
      chalk.red('Lepper is not initialized. Please run "lepper init" first.'),
    );
    return;
  }

  // Read the data from _info.json
  const lepperData = fs.existsSync(infoFilePath)
    ? JSON.parse(fs.readFileSync(infoFilePath, 'utf-8'))
    : {};

  // Lost? don't worry I'm just making data perfect for console.table!!!
  const tableData = Object.entries(lepperData.directories).map(
    ([directory, description]) => ({
      Directories: directory,
      Description: description,
    }),
  );
  console.table(tableData);
};

export default describeCommand;
