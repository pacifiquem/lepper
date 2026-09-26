import chalk from 'chalk';
import { withLepper } from '../notes/session';
import { CliError } from '../utils/errors';
import { projectCwd } from '../utils/git';
import { Log } from '../utils/log';
import { addRule, listRules, removeRule } from './rules';
import { RuleItem } from '../utils/types';

export interface RuleOptions {
  action?: string;
  id?: string;
  from?: string;
  to?: string;
  note?: string;
  agent?: string;
  cwd?: string;
  json?: boolean;
}

function printRule(rule: RuleItem): void {
  const from = rule.from.replace(/^\.\//, '');
  const to = rule.to.replace(/^\.\//, '');
  Log(`${chalk.bold(rule.id)}  ${from} -> ${to}`);
  Log(chalk.dim(rule.note));
}

const ruleCommand = (options: RuleOptions = {}): void => {
  const action = (options.action || 'list').toLowerCase();
  const cwd = projectCwd(options.cwd);
  const result = withLepper(cwd, (store) => {
    if (action === 'add') {
      if (!options.from?.trim() || !options.to?.trim()) {
        throw new CliError('rule add requires --from and --to.');
      }
      return {
        kind: 'one' as const,
        rule: addRule(store, {
          from: options.from,
          to: options.to,
          note: options.note,
          agent: options.agent,
        }),
      };
    }
    if (action === 'remove' || action === 'rm' || action === 'delete') {
      if (!options.id?.trim()) {
        throw new CliError('rule remove requires an id.');
      }
      return { kind: 'one' as const, rule: removeRule(store, options.id) };
    }
    if (action === 'list') {
      return { kind: 'list' as const, rules: listRules(store) };
    }
    throw new CliError(
      `Unknown rule action "${action}". Use add, list, or remove.`,
    );
  });

  if (options.json) {
    Log(
      JSON.stringify(
        result.kind === 'one' ? result.rule : result.rules,
        null,
        2,
      ),
    );
    return;
  }
  if (result.kind === 'one') {
    printRule(result.rule);
    return;
  }
  if (result.rules.length === 0) {
    Log('No architecture rules yet.');
    return;
  }
  for (const rule of result.rules) {
    printRule(rule);
  }
};

export default ruleCommand;
