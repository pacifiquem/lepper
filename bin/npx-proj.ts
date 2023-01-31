#!/usr/bin/env node

import { Command } from 'commander';
import { cwd } from 'process';
import path from "path";

const program = new Command();

//commandHandlers
import { init, generate, descriptionManager, descriptionDisplayer } from '../src/commands/commandHandlers';

program
  .name('npx-proj')
  .description('Node.js project-structure manager, developed by pacifiquem@github.com \n\n')
  .usage("command [options]")
  .version(`\x1b[1mv${require('../package.json').version}\x1b[0m`, '-v, --version', 'Output the current version.')
  .helpOption('-h, --help', 'Output usage information.');


program.command('init')
  .description('Command to initialize the project .')
  .argument('<string>', 'name of your project')
  .option('-fo, --folders <value...>', 'folder you want to initialize ?', '')
  .action((argument: string, options: { files: string[], folders: string[] }) => {
    let directory = cwd();
    init(argument, options.folders, directory);
  });

program.command('generate')
  .description('Command to generate any file in a given folder .')
  .argument('<string>', 'folder file will be generated into .')
  .option('-fi, --files <value...>', 'file you want to generate ?')
  .action((argument: string, options: { files: string[] }) => {

    let directory = cwd();
    directory = path.join(directory, argument);
    generate(options.files, directory);

  });

program.command('add-description')
  .description('Command to add description to your project And its sub folders .')
  .option('-p, --project <string>', 'project you want to add description to ?')
  .option('-fo, --folder <string>', 'folder you want to add description to ?')
  .option('-fi, --file <string>', 'file you want to add description to ?')
  .option('-m, --message <string>', 'message you want to add to your description ?')
  .action((argument: any, options: any) => {
    descriptionManager(argument);
  });

program.command('describe')
  .description('Command to display description of your project And its sub folders .')
  .option('-p, --project <string>', 'project you want to display description of ?')
  .option('-fo, --folder <string>', 'folder you want to display description of ?')
  .option('-fi, --file <string>', 'file you want to display description of ?')
  .action((argument: string, options: any) => {
    descriptionDisplayer(argument);
  });

program.parse();