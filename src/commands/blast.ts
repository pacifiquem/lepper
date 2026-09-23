import { CliError } from '../lib/errors';
import { Log } from '../lib/helper';
import { blastRadius, formatBlast } from '../lib/codemap';
import { projectCwd } from '../lib/git';

export interface BlastOptions {
  target?: string;
  depth?: number;
  cwd?: string;
  json?: boolean;
}

const blastCommand = (options: BlastOptions = {}): void => {
  const target = options.target?.trim();
  if (!target) {
    throw new CliError('blast requires a file, symbol, or path#symbol.');
  }

  const result = blastRadius(projectCwd(options.cwd), target, options.depth);

  if (options.json) {
    Log(JSON.stringify(result, null, 2));
    return;
  }

  Log(formatBlast(result));
};

export default blastCommand;
