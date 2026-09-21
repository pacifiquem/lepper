import chalk from 'chalk';
import { withLepper } from '../lib/api';
import { Log } from '../lib/helper';
import { shortFingerprint } from '../lib/fingerprint';
import { syncNotes } from '../lib/sync';
import { projectCwd } from '../lib/git';

const syncCommand = (cwd: string = projectCwd()): void => {
  const result = withLepper(cwd, (store) => syncNotes(store.root));
  const parts = [`snapshot ${shortFingerprint(result.commit, 12)}`];
  if (result.pulled) {
    parts.push('pulled');
  }
  if (result.pushed) {
    parts.push('pushed');
  } else if (!result.pulled) {
    parts.push('local only');
  }
  Log(chalk.green(`Synced lepper notes (${parts.join(', ')}).`));
};

export default syncCommand;
