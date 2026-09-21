import chalk from 'chalk';
import { withLepper } from '../lib/api';
import { CliError } from '../lib/errors';
import { Log } from '../lib/helper';
import { recordNote } from '../lib/notes';
import { shortFingerprint } from '../lib/fingerprint';
import { projectCwd } from '../lib/git';

export interface RecordOptions {
  path?: string;
  note?: string;
  title?: string;
  tags?: string[];
  agent?: string;
  cwd?: string;
}

const recordCommand = (options: RecordOptions): void => {
  const target = options.path?.trim();
  const note = options.note?.trim();
  if (!target) {
    throw new CliError('record requires a path.');
  }
  if (!note) {
    throw new CliError('record requires --note text.');
  }

  const saved = withLepper(projectCwd(options.cwd), (store) =>
    recordNote(store, {
      path: target,
      note,
      title: options.title,
      tags: options.tags,
      agent: options.agent,
    }),
  );

  Log(
    chalk.green(
      `Recorded ${saved.path}  [${shortFingerprint(saved.fingerprint)}]`,
    ),
  );
};

export default recordCommand;
