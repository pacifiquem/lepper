import chalk from 'chalk';
import { withLepper } from './session';
import { CliError } from '../utils/errors';
import { Log } from '../utils/log';
import { recordNote } from './notes';
import { shortFingerprint } from '../utils/fingerprint';
import { projectCwd } from '../utils/git';

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
