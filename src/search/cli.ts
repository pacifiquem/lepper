import chalk from 'chalk';
import { withLepper } from '../notes/session';
import { CliError } from '../utils/errors';
import { Log } from '../utils/log';
import { findNotes } from './search';
import { shortFingerprint } from '../utils/fingerprint';
import { projectCwd } from '../utils/git';

export interface FindOptions {
  query?: string;
  limit?: number;
  path?: string;
  cwd?: string;
  json?: boolean;
}

const findCommand = (options: FindOptions): void => {
  const query = options.query?.trim();
  if (!query) {
    throw new CliError('find requires a query.');
  }

  const hits = withLepper(projectCwd(options.cwd), (store) =>
    findNotes(store, {
      query,
      limit: options.limit,
      path: options.path,
    }),
  );

  if (options.json) {
    Log(JSON.stringify(hits, null, 2));
    return;
  }

  if (hits.length === 0) {
    Log(chalk.yellow('No notes matched that query.'));
    return;
  }

  for (const hit of hits) {
    Log(
      chalk.bold(
        `${hit.path}  [${shortFingerprint(hit.fingerprint)}]  score ${
          hit.score
        }`,
      ),
    );
    if (hit.tags.length) {
      Log(chalk.dim(hit.tags.join(', ')));
    }
    Log(hit.body);
    Log('');
  }
};

export default findCommand;
