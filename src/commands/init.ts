import fs from 'fs';
import inquirer from 'inquirer';
import type { Answers, QuestionCollection } from 'inquirer';
import chalk from 'chalk';
import { Log } from '../lib/helper';
import { CliError } from '../lib/errors';
import {
  createProjectInfo,
  getLepperDir,
  isInitialized,
  writeInfo,
} from '../lib/info';

type Prompt = (questions: QuestionCollection) => Promise<Answers>;

const defaultPrompt: Prompt = (questions) => inquirer.prompt(questions);

const initQuestions: QuestionCollection = [
  {
    type: 'input',
    name: 'name',
    message: chalk.cyan('Enter the project name:'),
  },
  {
    type: 'input',
    name: 'description',
    message: chalk.cyan('Enter a project description:'),
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
];

const collectProjectInfo = async (prompt: Prompt): Promise<Answers> => {
  while (true) {
    const answers = await prompt(initQuestions);

    if (answers.isInfoCorrect === 'Yes') {
      return answers;
    }

    Log(chalk.yellow('Please re-enter project information.'));
  }
};

const initCommand = async (
  cwd: string = process.cwd(),
  prompt: Prompt = defaultPrompt,
): Promise<void> => {
  if (isInitialized(cwd)) {
    throw new CliError('Lepper directory already exists.');
  }

  const lepperDirectory = getLepperDir(cwd);
  if (
    fs.existsSync(lepperDirectory) &&
    !fs.statSync(lepperDirectory).isDirectory()
  ) {
    throw new CliError(
      'Cannot initialize: .lepper exists and is not a directory.',
    );
  }

  const answers = await collectProjectInfo(prompt);
  const projectInfo = createProjectInfo(answers);

  writeInfo(cwd, projectInfo);
  Log(chalk.green('Lepper initialized successfully.'));
};

export default initCommand;
