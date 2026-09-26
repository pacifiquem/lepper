import { CliError } from '../utils/errors';
import { fingerprint, shortFingerprint } from '../utils/fingerprint';
import { normalizeProjectPath } from '../utils/paths';
import { readRules, Store, writeRules } from '../utils/store';
import { RuleItem } from '../utils/types';

export interface RuleInput {
  from: string;
  to: string;
  note?: string;
  agent?: string;
}

function agentOf(input?: string): string | undefined {
  return input?.trim() || process.env.LEPPER_AGENT || undefined;
}

function rulePath(input: string, root: string, label: string): string {
  const normalized = normalizeProjectPath(input, root);
  if (normalized.startsWith('..')) {
    throw new CliError(`${label} is outside the project: ${input}`);
  }
  return normalized;
}

function describe(from: string, to: string): string {
  const show = (value: string) => value.replace(/^\.\//, '');
  return `${show(from)} must not depend on ${show(to)}`;
}

export function addRule(store: Store, input: RuleInput): RuleItem {
  const from = rulePath(input.from, store.root, 'from');
  const to = rulePath(input.to, store.root, 'to');
  if (from === to) {
    throw new CliError('A rule needs two different paths.');
  }

  const index = readRules(store);
  const duplicate = Object.values(index.rules).find(
    (rule) => rule.from === from && rule.to === to,
  );
  if (duplicate) {
    throw new CliError(`That rule already exists: ${duplicate.id}`);
  }

  const createdAt = new Date().toISOString();
  const note = input.note?.trim() || describe(from, to);
  const payload = {
    from,
    to,
    note,
    createdAt,
    agent: agentOf(input.agent) || null,
  };
  const fp = fingerprint(payload);
  const rule: RuleItem = {
    id: `rule-${shortFingerprint(fp, 8)}`,
    fingerprint: fp,
    from,
    to,
    note,
    createdAt,
    updatedAt: createdAt,
    agent: agentOf(input.agent),
  };
  index.rules[rule.id] = rule;
  writeRules(store, index);
  return rule;
}

export function listRules(store: Store): RuleItem[] {
  return Object.values(readRules(store).rules).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

export function removeRule(store: Store, id: string): RuleItem {
  const index = readRules(store);
  const current = index.rules[id];
  if (!current) {
    throw new CliError(`Unknown rule: ${id}`);
  }
  delete index.rules[id];
  writeRules(store, index);
  return current;
}
