import fs from 'fs';
import path from 'path';
import { blastRadius } from '../codemap';
import { focusPath } from '../codemap/callgraph/graph';
import { collectSourceFiles, DEFAULT_DEPTH } from '../codemap/callgraph/scan';
import type { BlastRadius } from '../codemap/callgraph/types';
import { getNote, listNotes } from '../notes/notes';
import { listTodos } from '../todos/todos';
import { CliError } from '../utils/errors';
import { git } from '../utils/git';
import {
  changesSince,
  clearRenameCache,
  diffChanges,
  materialChanges,
} from '../utils/renames';
import type { Store } from '../utils/store';
import type { NoteBlob, TodoItem } from '../utils/types';

export interface PreflightTarget {
  label: string;
  path?: string;
  symbol?: string;
}

export interface PreflightReport {
  query: string;
  mode: 'target' | 'diff';
  targets: PreflightTarget[];
  affected: {
    files: number;
    callers: number;
    tests: number;
    truncated: boolean;
    ambiguous: boolean;
  };
  context: Array<{
    path: string;
    title: string;
    body: string;
  }>;
  active: Array<{
    id: string;
    title: string;
    status: TodoItem['status'];
  }>;
  stale: Array<{
    count: number;
    path: string;
    commit?: string;
    uncommitted: boolean;
    bodies: string[];
  }>;
  verification: string[];
}

export interface PreflightOptions {
  target?: string;
  diff?: boolean;
  depth?: number;
}

interface DependentRef {
  path: string;
  via: 'call' | 'import';
}

function displayPath(projectPath: string): string {
  return projectPath.replace(/^\.\//, '');
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function countLabel(count: number, singular: string, plural: string): string {
  return `  ${count} ${count === 1 ? singular : plural}`;
}

const TEST_DIRECTORIES = new Set([
  'test',
  'tests',
  '__tests__',
  'spec',
  'specs',
]);

export function isTestPath(filePath: string): boolean {
  const normalized = displayPath(filePath).replace(/\\/g, '/');
  const parts = normalized.split('/').filter((part) => part && part !== '.');
  const base = parts[parts.length - 1] || '';
  const directories = parts.slice(0, -1);
  if (
    directories.some((segment) => TEST_DIRECTORIES.has(segment.toLowerCase()))
  ) {
    return true;
  }
  if (/(?:^|[._-])(?:test|spec)(?:[._-]|$)/i.test(base)) {
    return true;
  }
  return /Tests?\.java$/.test(base) || /_test\.(go|exs|erl|py)$/.test(base);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsPath(text: string, projectPath: string): boolean {
  const shown = displayPath(projectPath).toLowerCase();
  const haystack = text.toLowerCase();
  if (!shown || shown === '.') {
    return false;
  }
  if (haystack.includes(shown) || haystack.includes(`./${shown}`)) {
    return true;
  }
  const parts = shown.split('/');
  for (let length = parts.length - 1; length >= 2; length -= 1) {
    const parent = parts.slice(0, length).join('/');
    if (haystack.includes(parent)) {
      return true;
    }
  }
  return false;
}

function mentionsSymbol(text: string, symbol: string): boolean {
  const name = symbol.trim();
  if (name.length < 4) {
    return false;
  }
  return new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text);
}

function textMentions(text: string, target: PreflightTarget): boolean {
  if (target.path && mentionsPath(text, target.path)) {
    return true;
  }
  if (target.symbol && mentionsSymbol(text, target.symbol)) {
    return true;
  }
  return false;
}

function pathApplies(notePath: string, targetPath: string): boolean {
  if (notePath === targetPath || notePath === '.') {
    return true;
  }
  if (targetPath.startsWith(`${notePath}/`)) {
    return true;
  }
  if (targetPath !== '.' && notePath.startsWith(`${targetPath}/`)) {
    return true;
  }
  return false;
}

function noteApplies(note: NoteBlob, targets: PreflightTarget[]): boolean {
  const text = `${note.title}\n${note.body}`;
  return targets.some(
    (target) =>
      (target.path ? pathApplies(note.path, target.path) : false) ||
      (target.symbol ? mentionsSymbol(text, target.symbol) : false),
  );
}

function specificity(notePath: string, targets: PreflightTarget[]): number {
  let best = 0;
  for (const target of targets) {
    if (!target.path) {
      continue;
    }
    if (notePath === target.path) {
      best = Math.max(best, 10000 + notePath.length);
    } else if (notePath === '.' || target.path.startsWith(`${notePath}/`)) {
      best = Math.max(best, notePath === '.' ? 1 : notePath.length);
    } else if (notePath.startsWith(`${target.path}/`)) {
      best = Math.max(best, 5000 + notePath.length);
    }
  }
  return best;
}

function changedFiles(root: string): string[] {
  const names = new Set<string>();
  const collect = (args: string[]): void => {
    const result = git(root, args);
    if (result.status !== 0) {
      return;
    }
    for (const line of result.stdout.split('\n')) {
      const name = line.trim();
      if (name) {
        names.add(name);
      }
    }
  };
  collect(['diff', '--name-only', '--no-renames', 'HEAD']);
  collect(['diff', '--name-only', '--no-renames', '--cached']);
  collect(['ls-files', '--others', '--exclude-standard']);
  return Array.from(names).sort();
}

function targetFromQuery(root: string, query: string): PreflightTarget {
  const trimmed = query.trim();
  const hash = trimmed.indexOf('#');
  if (hash !== -1) {
    const pathPart = trimmed.slice(0, hash).trim();
    const symbol = trimmed.slice(hash + 1).trim();
    if (!pathPart || !symbol) {
      throw new CliError(
        'preflight requires a file, symbol, path#symbol, or --diff.',
      );
    }
    const normalized = focusPath(root, pathPart);
    return {
      label: `${displayPath(normalized || pathPart)}#${symbol}`,
      path: normalized,
      symbol,
    };
  }

  const looksLikePath =
    trimmed.includes('/') ||
    trimmed.includes('..') ||
    path.isAbsolute(trimmed) ||
    path.extname(trimmed).length > 0 ||
    fs.existsSync(path.join(root, trimmed));
  if (!looksLikePath) {
    return { label: trimmed, symbol: trimmed };
  }

  const normalized = focusPath(root, trimmed);
  return {
    label: displayPath(normalized || trimmed),
    path: normalized,
  };
}

function blastQueries(
  root: string,
  target: PreflightTarget,
): { queries: string[]; truncated: boolean } {
  const single = target.symbol
    ? target.path
      ? `${displayPath(target.path)}#${target.symbol}`
      : target.symbol
    : target.path
      ? displayPath(target.path)
      : target.label;
  if (!target.path || target.symbol) {
    return { queries: [single], truncated: false };
  }

  const absolute = path.join(root, displayPath(target.path));
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    return { queries: [single], truncated: false };
  }

  const collected = collectSourceFiles(root);
  const prefix =
    target.path === '.' ? './' : `${target.path.replace(/\/$/, '')}/`;
  const inside = collected.files.filter((file) =>
    target.path === '.' ? true : file.startsWith(prefix),
  );
  if (inside.length === 0) {
    return { queries: [single], truncated: collected.truncated };
  }
  return {
    queries: inside.map((file) => displayPath(file)),
    truncated: collected.truncated,
  };
}

function labelFromBlast(target: PreflightTarget, result: BlastRadius): string {
  if (target.path || target.label.includes('#')) {
    return target.label;
  }
  if (result.definitions.length === 1) {
    const defined = result.definitions[0];
    return `${displayPath(defined.path)}#${defined.qualified}`;
  }
  return target.label;
}

interface FileDrift {
  commit?: string;
  uncommitted: boolean;
}

function earliestTouch(
  root: string,
  relative: string,
  noteTime: number,
): { sha: string; time: number } | undefined {
  const history = git(root, [
    'log',
    '--full-history',
    '--format=%H%x09%cI',
    '--',
    relative,
  ]);
  if (history.status !== 0) {
    return undefined;
  }
  let earliest: { sha: string; time: number } | undefined;
  for (const line of history.stdout.split('\n')) {
    const [sha, date] = line.split('\t');
    if (!sha || !date) {
      continue;
    }
    const time = Date.parse(date);
    if (!Number.isFinite(time) || time <= noteTime) {
      continue;
    }
    if (!earliest || time < earliest.time) {
      earliest = { sha, time };
    }
  }
  return earliest;
}

function driftSince(
  root: string,
  notePath: string,
  createdAt: string,
): FileDrift | null {
  const relative = displayPath(notePath);
  const absolute = path.join(root, relative);
  const noteTime = Date.parse(createdAt);
  if (!Number.isFinite(noteTime)) {
    return null;
  }

  const baseline = git(root, [
    'rev-list',
    '-1',
    `--before=${new Date(noteTime).toISOString()}`,
    'HEAD',
  ]);
  const baselineSha =
    baseline.status === 0 ? baseline.stdout.split('\n')[0] : '';
  const committed = baselineSha
    ? materialChanges(notePath, diffChanges(root, baselineSha, 'HEAD'))
    : materialChanges(notePath, changesSince(root, createdAt));
  const uncommittedChanges = materialChanges(
    notePath,
    diffChanges(root, 'HEAD'),
  );
  if (committed.length === 0 && uncommittedChanges.length === 0) {
    return null;
  }
  const earliest =
    committed.length > 0 ? earliestTouch(root, relative, noteTime) : undefined;
  let commit = earliest?.sha.slice(0, 7);
  if (committed.length > 0 && !commit) {
    const head = git(root, ['rev-parse', '--short=7', 'HEAD']);
    commit =
      head.status === 0 ? head.stdout.split('\n')[0] || undefined : undefined;
  }
  if (!fs.existsSync(absolute) && !commit && uncommittedChanges.length === 0) {
    return null;
  }
  return {
    commit,
    uncommitted: commit ? false : true,
  };
}

export function preflightReport(
  root: string,
  store: Store,
  options: PreflightOptions = {},
): PreflightReport {
  const requested = options.target?.trim() || '';
  const diff = Boolean(options.diff);
  if (requested && diff) {
    throw new CliError('Pass a target or --diff, not both.');
  }
  if (!requested && !diff) {
    throw new CliError(
      'preflight requires a file, symbol, path#symbol, or --diff.',
    );
  }

  clearRenameCache();
  const depth = options.depth ?? DEFAULT_DEPTH;
  let targets: PreflightTarget[];
  let query: string;
  let mode: PreflightReport['mode'];

  if (diff) {
    const files = changedFiles(root);
    if (files.length === 0) {
      throw new CliError('No changes in the working tree.');
    }
    targets = files.map((file) => targetFromQuery(root, file));
    query = 'working tree diff';
    mode = 'diff';
  } else {
    targets = [targetFromQuery(root, requested)];
    query = requested;
    mode = 'target';
  }

  const dependents: DependentRef[] = [];
  const seenDependents = new Set<string>();
  let truncated = false;
  let ambiguous = false;
  const resolvedTargets: PreflightTarget[] = [];

  for (const target of targets) {
    const expanded = blastQueries(root, target);
    truncated = truncated || expanded.truncated;
    let representative: BlastRadius | undefined;
    for (const blastQuery of expanded.queries) {
      const result = blastRadius(root, blastQuery, depth);
      representative = representative || result;
      truncated = truncated || result.truncated;
      ambiguous = ambiguous || result.ambiguous;
      for (const item of result.dependents) {
        const key = `${item.via}\0${item.path}\0${item.name}\0${item.line}`;
        if (seenDependents.has(key)) {
          continue;
        }
        seenDependents.add(key);
        dependents.push({ path: item.path, via: item.via });
      }
    }
    const result = representative || {
      query: target.label,
      depth,
      ambiguous: false,
      truncated: false,
      definitions: [],
      dependents: [],
    };
    const resolved: PreflightTarget = {
      ...target,
      label:
        expanded.queries.length > 1
          ? target.label
          : labelFromBlast(target, result),
      path: target.path,
    };
    if (!resolved.path && result.definitions.length === 1) {
      resolved.path = result.definitions[0]?.path;
    }
    resolvedTargets.push(resolved);
  }

  const filePaths = new Set<string>();
  const testPaths = new Set<string>();
  let callers = 0;
  for (const item of dependents) {
    filePaths.add(item.path);
    if (isTestPath(item.path)) {
      testPaths.add(item.path);
      continue;
    }
    if (item.via === 'call') {
      callers += 1;
    }
  }

  const contextNotes = listNotes(store)
    .map((summary) => getNote(store, summary.path))
    .filter((note): note is NoteBlob => Boolean(note))
    .filter((note) => noteApplies(note, resolvedTargets))
    .sort(
      (left, right) =>
        specificity(right.path, resolvedTargets) -
          specificity(left.path, resolvedTargets) ||
        left.path.localeCompare(right.path),
    );

  const active = listTodos(store).filter(
    (todo) =>
      todo.status !== 'done' &&
      resolvedTargets.some((target) =>
        textMentions(`${todo.title}\n${todo.body}`, target),
      ),
  );

  const freshNotes: NoteBlob[] = [];
  const staleGroups = new Map<
    string,
    {
      count: number;
      path: string;
      commit?: string;
      uncommitted: boolean;
      bodies: string[];
    }
  >();
  for (const note of contextNotes) {
    const drift = driftSince(root, note.path, note.createdAt);
    if (!drift) {
      freshNotes.push(note);
      continue;
    }
    const shown = displayPath(note.path);
    const key = `${shown}\0${drift.commit || ''}\0${drift.uncommitted}`;
    const current = staleGroups.get(key) || {
      count: 0,
      path: shown,
      commit: drift.commit,
      uncommitted: drift.uncommitted,
      bodies: [],
    };
    current.count += 1;
    current.bodies.push(oneLine(note.body));
    staleGroups.set(key, current);
  }

  return {
    query,
    mode,
    targets: resolvedTargets,
    affected: {
      files: filePaths.size,
      callers,
      tests: testPaths.size,
      truncated,
      ambiguous,
    },
    context: freshNotes.map((note) => ({
      path: displayPath(note.path),
      title: note.title,
      body: note.body,
    })),
    active: active.map((todo) => ({
      id: todo.id,
      title: todo.title,
      status: todo.status,
    })),
    stale: Array.from(staleGroups.values()),
    verification: Array.from(testPaths).map(displayPath).sort(),
  };
}

export function formatPreflight(report: PreflightReport): string {
  const lines = ['CHANGE PREFLIGHT', '', 'Target:'];
  if (report.mode === 'diff') {
    lines.push('  working tree diff');
    for (const target of report.targets) {
      lines.push(`    ${target.label}`);
    }
  } else {
    for (const target of report.targets) {
      lines.push(`  ${target.label}`);
    }
  }
  if (report.affected.ambiguous) {
    lines.push('  name matches more than one symbol');
  }

  lines.push(
    '',
    'Affected:',
    countLabel(report.affected.files, 'file', 'files'),
    countLabel(report.affected.callers, 'caller', 'callers'),
    countLabel(report.affected.tests, 'test', 'tests'),
  );
  if (report.affected.truncated) {
    lines.push('  scan truncated');
  }

  lines.push('', 'Known context:');
  if (report.context.length === 0) {
    lines.push('  None');
  } else {
    for (const note of report.context) {
      lines.push(`  - ${oneLine(note.body)}`);
    }
  }

  lines.push('', 'Active work:');
  if (report.active.length === 0) {
    lines.push('  None');
  } else {
    for (const todo of report.active) {
      const status = todo.status === 'doing' ? '  [doing]' : '';
      lines.push(`  ${todo.id}: ${todo.title}${status}`);
    }
  }

  lines.push('', 'Potential stale knowledge:');
  if (report.stale.length === 0) {
    lines.push('  None');
  } else {
    for (const item of report.stale) {
      const noun = item.count === 1 ? 'note' : 'notes';
      const when = item.commit
        ? `before commit ${item.commit}`
        : 'with uncommitted changes';
      lines.push(`  ${item.count} ${noun} based on ${item.path} ${when}`);
      for (const body of item.bodies) {
        lines.push(`    - ${body}`);
      }
    }
  }

  lines.push('', 'Suggested verification:');
  if (report.verification.length === 0) {
    lines.push('  None');
  } else {
    for (const file of report.verification) {
      lines.push(`  - ${file}`);
    }
  }

  return lines.join('\n');
}
