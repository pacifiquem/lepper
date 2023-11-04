#!/usr/bin/env node

import { Command } from 'commander';
import pkg from '../package.json';
import process from 'process';

// Command Handlers
import initCommand from '../commands/init';
import describeCommand from '../commands/describe';
import profileCommand from '../commands/profile';
import verifyCommand from '../commands/verify';

const program = new Command();

program
  .name('lepper')
  .description("Understand any project's structure easily.")
  .usage('command [options]')
  .version(
    `\x1b[1mv${pkg.version}\x1b[0m`,
    '-v, --version',
    "Output lepper's current version.",
  )
  .helpOption('-h, --help', 'Output usage of lepper');

program
  .command('init')
  .description('Initialize lepper in your project')
  .action(() => initCommand());

program
  .command('profile')
  .description('Set description to a directory.')
  .option('-f, --folder <path>', 'Specify folder to set description for')
  .action((cmd) => {
    const options = cmd.opts();
    profileCommand(options.folder);
  });

program
  .command('verify')
  .description('Verify and list undescibed folders')
  .action(() => verifyCommand());

program
  .command('describe')
  .description('Provide project description')
  .option('-f, --folder <path>', 'Specify the folder to describe')
  .action(() => describeCommand());

program.parse(process.argv);
