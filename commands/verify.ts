import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { Log } from '../lib/helper';

interface LepperData {
  directories?: { [key: string]: string };
}

const verifyCommand = () => {
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
  const lepperData: LepperData = fs.existsSync(infoFilePath)
    ? JSON.parse(fs.readFileSync(infoFilePath, 'utf-8'))
    : {};

  // Check for undescribed directories
  const directories = lepperData.directories || {};
  const undescribedDirectories: string[] = [];

  fs.readdirSync(process.cwd()).forEach((file) => {
    const filePath = path.join(process.cwd(), file);

    if (fs.statSync(filePath).isDirectory() && !directories[filePath]) {
      undescribedDirectories.push(filePath);
    }
  });

  if (undescribedDirectories.length === 0) {
    Log(chalk.green('All directories are described.'));
  } else {
    Log(chalk.red('Undescribed directories:'));
    undescribedDirectories.forEach((directory) => {
      Log(chalk.yellow(directory));
    });
  }
};

export default verifyCommand;
