import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Log } from '../lib/helper';

const profileCommand = (folderDir: string) => {
  const lepperDirectory = path.join(process.cwd(), '.lepper');
  const infoFilePath = path.join(lepperDirectory, '_info.json');

  // Check if the .lepper directory exists
  if (!fs.existsSync(lepperDirectory)) {
    Log(
      chalk.red('Lepper is not initialized. Please run "lepper init" first.'),
    );
    return;
  }

  // Read existing data from _info.json
  const lepperData = fs.existsSync(infoFilePath)
    ? JSON.parse(fs.readFileSync(infoFilePath, 'utf-8'))
    : {};

  // Prompt the user for a description
  inquirer
    .prompt([
      {
        type: 'input',
        name: 'description',
        message: chalk.cyan(
          `Enter a description for the directory "${folderDir}":`,
        ),
      },
    ])
    .then((answers) => {
      // Initialize the "directories" field if it doesn't exist
      if (!lepperData.directories) {
        lepperData.directories = {};
      }

      // Add the directory and its description to the data
      lepperData.directories[folderDir] = answers.description;

      // Update _info.json with the new data
      fs.writeFileSync(infoFilePath, JSON.stringify(lepperData, null, 2));
      Log(chalk.green(`Description for "${folderDir}" set successfully.`));
    });
};

export default profileCommand;
