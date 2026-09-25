import chalk from 'chalk';
import { withLepper } from './session';
import { Log } from '../utils/log';
import { shortFingerprint } from '../utils/fingerprint';
import { syncNotes } from './sync';
import { projectCwd } from '../utils/git';

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
