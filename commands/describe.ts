import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
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

  // Prompt the user for a project description
  inquirer
    .prompt([
      {
        type: 'input',
        name: 'description',
        message: chalk.cyan('Enter a project description:'),
      },
    ])
    .then((answers) => {
      // Set the project description in the data
      lepperData.description = answers.description;

      // Update _info.json with the new data
      fs.writeFileSync(infoFilePath, JSON.stringify(lepperData, null, 2));
      Log(chalk.green('Project description set successfully.'));
    });
};

export default describeCommand;
