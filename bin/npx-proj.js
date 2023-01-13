#!/usr/bin/env node


const { Command } = require('commander');
const program = new Command();
const path = require('path');
const { cwd } = require('process');

//commandHandlers
const { init, generate, descriptionManager, descriptionDisplayer} = require('../src/commands/commandHandlers');

program
  .name('npx-proj')
  .description('Node.js project-structure manager built on top of commander.js, developed by pacifiquem@github.com')
  .version('1.0.4');

  program.command('init')
  .description('Command to initialize the project .')
  .argument('<string>', 'name of your project')
  .option('-fo, --folders <value...>', 'folder you want to initialize ?', '')
  .action((argument, options) => {
    let directory = cwd();
    init(argument, options.folders, directory);
  });

  program.command('generate')
  .description('Command to generate any file in a given folder .')
  .argument('<string>', 'folder file will be generated into .')
  .option('-fi, --files <value...>', 'file you want to generate ?')
  .action((argument, options) => {

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
  .action((argument, options) => {
    descriptionManager(argument);
  });

  program.command('describe')
  .description('Command to display description of your project And its sub folders .')
  .option('-p, --project <string>', 'project you want to display description of ?')
  .option('-fo, --folder <string>', 'folder you want to display description of ?')
  .option('-fi, --file <string>', 'file you want to display description of ?')
  .action((argument, options) => {
    descriptionDisplayer(argument);
  });


  
program.parse();