import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import type { Answers, QuestionCollection } from 'inquirer';
import chalk from 'chalk';
import { Log } from '../lib/helper';
import { CliError } from '../lib/errors';
import { readInfo, writeInfo } from '../lib/info';
import { normalizeProjectPath } from '../lib/paths';

type Prompt = (questions: QuestionCollection) => Promise<Answers>;

const defaultPrompt: Prompt = (questions) => inquirer.prompt(questions);

const profileCommand = async (
  folderDir?: string,
  cwd: string = process.cwd(),
  prompt: Prompt = defaultPrompt,
): Promise<void> => {
  const lepperData = readInfo(cwd);

  let selectedDir = folderDir;

  if (selectedDir === undefined || selectedDir.trim() === '') {
    const answers = await prompt([
      {
        type: 'input',
        name: 'directory',
        message: chalk.cyan('Please specify the directory: '),
      },
    ]);

    selectedDir = String(answers.directory ?? '').trim();
    if (!selectedDir) {
      throw new CliError("Directory can't be empty.");
    }
  }

  const normalized = normalizeProjectPath(selectedDir, cwd);
  const absolute = path.resolve(cwd, normalized);

  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw new CliError(`Directory does not exist: ${normalized}`);
  }

  const answers = await prompt([
    {
      type: 'input',
      name: 'description',
      message: chalk.cyan(
        `Enter a description for the directory "${normalized}":`,
      ),
    },
  ]);

  lepperData.directories[normalized] = String(answers.description ?? '');
  writeInfo(cwd, lepperData);
  Log(chalk.green(`Description for "${normalized}" set successfully.`));
};

export default profileCommand;
