import { CliError } from '../utils/errors';
import { Log } from '../utils/log';
import { codeMap, formatCodeMap } from '.';
import { projectCwd } from '../utils/git';

export interface CodeOptions {
  path?: string;
  symbol?: string;
  cwd?: string;
  json?: boolean;
}

const codeCommand = (options: CodeOptions = {}): void => {
  const cwd = projectCwd(options.cwd);
  let map;
  try {
    map = codeMap(cwd, { path: options.path, symbol: options.symbol });
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(message);
  }

  if (options.json) {
    Log(JSON.stringify(map, null, 2));
    return;
  }

  Log(formatCodeMap(map));
};

export default codeCommand;
