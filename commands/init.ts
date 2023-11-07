import process from 'process';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Log } from '../lib/helper';

const initCommand = () => {
  const currentDirectory = process.cwd();
  const lepperDirectory = path.join(currentDirectory, '.lepper');

  // Create the .lepper directory if it doesn't exist
  if (!fs.existsSync(lepperDirectory)) {
    fs.mkdirSync(lepperDirectory);

    const infoFilePath = path.join(lepperDirectory, '_info.json');

    const collectProjectInfo = () => {
      inquirer
        .prompt([
          {
            type: 'input',
            name: 'name',
            message: chalk.cyan('Enter the project name:'),
          },
          {
            type: 'input',
            name: 'version',
            message: chalk.cyan('Enter the project version:'),
          },
          {
            type: 'input',
            name: 'author',
            message: chalk.cyan('Enter the author:'),
          },
          {
            type: 'list',
            name: 'isInfoCorrect',
            message: chalk.yellow('Does the project information look correct?'),
            choices: ['Yes', 'No'],
          },
        ])
        .then((answers) => {
          if (answers.isInfoCorrect === 'Yes') {
            const projectInfo = {
              name: answers.name,
              version: answers.version,
              author: answers.author,
            };

            // Create the _info.json file with the provided data
            fs.writeFileSync(
              infoFilePath,
              JSON.stringify(projectInfo, null, 2),
            );
            Log(chalk.green('Lepper initialized successfully.'));
          } else {
            Log(chalk.yellow('Please re-enter project information.'));
            collectProjectInfo();
          }
        });
    };

    collectProjectInfo();
  } else {
    Log(chalk.yellow('Lepper directory already exists.'));
  }
};

export default initCommand;
