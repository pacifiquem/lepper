import chalk from 'chalk';
import { withLepper } from '../lib/api';
import { Log } from '../lib/helper';
import { formatMap, projectMap } from '../lib/map';
import { getNote } from '../lib/notes';
import { normalizeProjectPath } from '../lib/paths';
import { shortFingerprint } from '../lib/fingerprint';
import { projectCwd } from '../lib/git';

export interface MapOptions {
  path?: string;
  cwd?: string;
  json?: boolean;
}

const mapCommand = (options: MapOptions = {}): void => {
  const cwd = projectCwd(options.cwd);
  const result = withLepper(cwd, (store) => {
    const prefix = options.path
      ? normalizeProjectPath(options.path, store.root)
      : undefined;
    const tree = projectMap(store, prefix);
    const focused = prefix ? getNote(store, prefix) : undefined;
    return { tree, focused };
  });

  if (options.json) {
    Log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.focused) {
    Log(chalk.bold(`${result.focused.path}`));
    Log(
      chalk.dim(
        `fingerprint ${shortFingerprint(result.focused.fingerprint)}  agent ${
          result.focused.agent || 'unknown'
        }`,
      ),
    );
    Log(result.focused.body);
    Log('');
  }

  Log(chalk.bold('Project map'));
  Log(formatMap(result.tree));
};

export default mapCommand;
