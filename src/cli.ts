import { Command } from 'commander';
import pkg from '../package.json';
import process from 'process';
import { handleError } from './lib/errors';
import recordCommand from './commands/record';
import mapCommand from './commands/map';
import findCommand from './commands/find';
import codeCommand from './commands/code';
import blastCommand from './commands/blast';
import diaryCommand from './commands/diary';
import todoCommand from './commands/todo';
import syncCommand from './commands/sync';
import {
  describeCommand,
  initCommand,
  profileCommand,
  verifyCommand,
} from './commands/deprecated';
import { startMcpServer } from './mcp/server';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('lepper')
    .description(
      'Shared notes for AI agents working on a codebase. Record, map, find, codemap, blast, diary, and todo.',
    )
    .usage('command [options]')
    .version(
      `\x1b[1mv${pkg.version}\x1b[0m`,
      '-v, --version',
      "Output lepper's current version.",
    )
    .helpOption('-h, --help', 'Output usage of lepper');

  program
    .command('record')
    .description('Save a note about a path for other agents')
    .argument('<path>', 'Directory or file to annotate')
    .requiredOption('-n, --note <text>', 'Note text')
    .option('-t, --title <text>', 'Optional short title')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--agent <name>', 'Agent name')
    .action(
      (
        pathArg: string,
        options: {
          note?: string;
          title?: string;
          tags?: string;
          agent?: string;
        },
      ) => {
        recordCommand({
          path: pathArg,
          note: options.note,
          title: options.title,
          tags: options.tags
            ? options.tags.split(',').map((tag) => tag.trim())
            : undefined,
          agent: options.agent,
        });
      },
    );

  program
    .command('map')
    .description('Show a project overview from recorded notes')
    .argument('[path]', 'Optional path to focus')
    .option('--json', 'Print JSON')
    .action((pathArg: string | undefined, options: { json?: boolean }) => {
      mapCommand({ path: pathArg, json: options.json });
    });

  program
    .command('codemap')
    .description('Show what calls what, read from the source tree')
    .argument('[path]', 'Optional file or directory to focus')
    .option('--symbol <name>', 'Focus one function, method, or class')
    .option('--json', 'Print JSON')
    .action(
      (
        pathArg: string | undefined,
        options: { symbol?: string; json?: boolean },
      ) => {
        codeCommand({
          path: pathArg,
          symbol: options.symbol,
          json: options.json,
        });
      },
    );

  program
    .command('blast')
    .description('Show what depends on a file or symbol before you change it')
    .argument('<target>', 'File, symbol, or path#symbol')
    .option('--depth <n>', 'Caller hops to follow', (value) => Number(value))
    .option('--json', 'Print JSON')
    .action((target: string, options: { depth?: number; json?: boolean }) => {
      blastCommand({
        target,
        depth: options.depth,
        json: options.json,
      });
    });

  program
    .command('find')
    .description('Find notes with a natural-language query')
    .argument('<query...>', 'Query such as "where is caching"')
    .option('--path <path>', 'Limit search to a path')
    .option('--limit <n>', 'Maximum results', (value) => Number(value))
    .option('--json', 'Print JSON')
    .action(
      (
        queryParts: string[],
        options: { path?: string; limit?: number; json?: boolean },
      ) => {
        findCommand({
          query: queryParts.join(' '),
          path: options.path,
          limit: options.limit,
          json: options.json,
        });
      },
    );

  program
    .command('diary')
    .description(
      'Session diary shared across agents: what was done, what went well, and what went wrong',
    )
    .argument('[action]', 'recall, list, or write', 'recall')
    .option('--work <text>', 'One line describing the work, for write')
    .option(
      '--well <text>',
      'Something that went well or that the user liked. Repeat to add more.',
      (value: string, previous: string[]) => {
        previous.push(value);
        return previous;
      },
      [] as string[],
    )
    .option(
      '--wrong <text>',
      'Something that went wrong or that the user did not want. Repeat to add more.',
      (value: string, previous: string[]) => {
        previous.push(value);
        return previous;
      },
      [] as string[],
    )
    .option('--agent <name>', 'Agent name')
    .option('--limit <n>', 'How many entries to read', (value) => Number(value))
    .option('--json', 'Print JSON')
    .action(
      (
        action: string,
        options: {
          work?: string;
          well?: string[];
          wrong?: string[];
          agent?: string;
          limit?: number;
          json?: boolean;
        },
      ) => {
        diaryCommand({
          action,
          work: options.work,
          wentWell: options.well,
          wentWrong: options.wrong,
          agent: options.agent,
          limit: options.limit,
          json: options.json,
        });
      },
    );

  program
    .command('todo')
    .description('Share todos with other agents on this repo')
    .argument('[action]', 'add, list, start, or done', 'list')
    .argument('[rest...]', 'Title for add, or id for start/done')
    .option('--body <text>', 'Optional details when adding')
    .option('--status <status>', 'Filter list: open, doing, done')
    .option('--agent <name>', 'Agent name')
    .option('--json', 'Print JSON')
    .action(
      (
        action: string,
        rest: string[],
        options: {
          body?: string;
          status?: 'open' | 'doing' | 'done';
          agent?: string;
          json?: boolean;
        },
      ) => {
        const joined = rest.join(' ');
        todoCommand({
          action,
          title: action === 'add' ? joined : undefined,
          id: action !== 'add' ? joined || undefined : undefined,
          body: options.body,
          status: options.status,
          agent: options.agent,
          json: options.json,
        });
      },
    );

  program
    .command('sync')
    .description('Share notes with other clones via git ref refs/lepper/notes')
    .action(() => {
      syncCommand();
    });

  program
    .command('mcp')
    .description('Start the MCP server on stdio')
    .action(async () => {
      await startMcpServer();
    });

  program
    .command('init')
    .description('[deprecated] Use record')
    .action(() => initCommand());

  program
    .command('profile')
    .description('[deprecated] Use record')
    .option('-f, --folder <path>', 'Ignored')
    .action(() => profileCommand());

  program
    .command('verify')
    .description('[deprecated] Use map')
    .action(() => verifyCommand());

  program
    .command('describe')
    .description('[deprecated] Use map')
    .action(() => describeCommand());

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    handleError(error);
  }
}
