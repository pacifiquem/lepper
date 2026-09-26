import { withLepper } from '../notes/session';
import { CliError } from '../utils/errors';
import { projectCwd } from '../utils/git';
import { Log } from '../utils/log';
import { checkRules, formatCheck } from './check';

export interface CheckOptions {
  path?: string;
  cwd?: string;
  json?: boolean;
}

const checkCommand = (options: CheckOptions = {}): void => {
  const cwd = projectCwd(options.cwd);
  const report = withLepper(cwd, (store) =>
    checkRules(cwd, store, options.path),
  );
  if (options.json) {
    Log(JSON.stringify(report, null, 2));
  } else {
    Log(formatCheck(report));
  }
  if (!report.ok) {
    throw new CliError('Architecture check found broken rules.', 1, true);
  }
};

export default checkCommand;
