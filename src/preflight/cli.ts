import { withLepper } from '../notes/session';
import { Log } from '../utils/log';
import { projectCwd } from '../utils/git';
import { formatPreflight, preflightReport } from './preflight';

export interface PreflightCommandOptions {
  target?: string;
  diff?: boolean;
  depth?: number;
  cwd?: string;
  json?: boolean;
}

const preflightCommand = (options: PreflightCommandOptions = {}): void => {
  const cwd = projectCwd(options.cwd);
  const report = withLepper(cwd, (store) =>
    preflightReport(cwd, store, {
      target: options.target,
      diff: options.diff,
      depth: options.depth,
    }),
  );

  if (options.json) {
    Log(JSON.stringify(report, null, 2));
    return;
  }

  Log(formatPreflight(report));
};

export default preflightCommand;
