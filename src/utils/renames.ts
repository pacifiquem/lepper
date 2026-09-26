import fs from 'fs';
import path from 'path';
import { git } from './git';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export interface TreeChange {
  status: string;
  from: string;
  to: string;
}

const sinceCache = new Map<string, TreeChange[]>();

export function clearRenameCache(): void {
  sinceCache.clear();
}

export function showPath(projectPath: string): string {
  const relative = projectPath.replace(/^\.\//, '').replace(/\/$/, '');
  return relative === '' ? '.' : relative;
}

export function dotPath(relative: string): string {
  if (relative === '.' || relative === '') {
    return '.';
  }
  return relative.startsWith('./') ? relative : `./${relative}`;
}

export function isIdenticalRename(change: TreeChange): boolean {
  return /^R100/.test(change.status);
}

export function coversPath(prefix: string, filePath: string): boolean {
  const root = showPath(prefix);
  const file = showPath(filePath);
  if (root === '.') {
    return true;
  }
  return file === root || file.startsWith(`${root}/`);
}

/**
 * A pure rename stays fresh when the file lands inside the note path.
 * A file that leaves the path is a real change to that path.
 */
export function materialChanges(
  notePath: string,
  changes: TreeChange[],
): TreeChange[] {
  return changes.filter((change) => {
    const touches =
      coversPath(notePath, change.from) || coversPath(notePath, change.to);
    if (!touches) {
      return false;
    }
    if (!isIdenticalRename(change)) {
      return true;
    }
    return !coversPath(notePath, change.to);
  });
}

export function changesSince(root: string, createdAt: string): TreeChange[] {
  const key = `${path.resolve(root)}\0${createdAt}`;
  const cached = sinceCache.get(key);
  if (cached) {
    return cached;
  }
  const baseline = baselineBefore(root, createdAt);
  const changes = diffChanges(root, baseline);
  sinceCache.set(key, changes);
  return changes;
}

export function diffChanges(
  root: string,
  from: string,
  to?: string,
): TreeChange[] {
  const args = ['diff', '--find-renames=100%', '--name-status', from];
  if (to) {
    args.push(to);
  }
  const result = git(root, args);
  if (result.status !== 0) {
    return [];
  }
  const parsed = parseNameStatus(result.stdout);
  if (to) {
    return parsed;
  }
  return pairUntrackedCopies(root, from, parsed);
}

export function relocatedPath(
  root: string,
  projectPath: string,
  changes: TreeChange[],
): string | null {
  const current = showPath(projectPath);
  if (current === '.') {
    return null;
  }

  const exact = changes.find(
    (change) => isIdenticalRename(change) && change.from === current,
  );
  if (exact) {
    if (pathExists(root, exact.to) && !pathExists(root, exact.from)) {
      return dotPath(exact.to);
    }
    return null;
  }

  if (containsFiles(root, current)) {
    return null;
  }

  const nested = changes.filter(
    (change) =>
      change.from === current || change.from.startsWith(`${current}/`),
  );
  if (
    nested.length === 0 ||
    nested.some((change) => !isIdenticalRename(change))
  ) {
    return null;
  }

  let prefix: string | null = null;
  for (const change of nested) {
    const suffix = change.from.slice(current.length + 1);
    if (!suffix || !change.to.endsWith(`/${suffix}`)) {
      return null;
    }
    const next = change.to
      .slice(0, change.to.length - suffix.length)
      .replace(/\/$/, '');
    if (!next || next === current) {
      return null;
    }
    if (prefix === null) {
      prefix = next;
    } else if (prefix !== next) {
      return null;
    }
  }
  if (!prefix || !pathExists(root, prefix)) {
    return null;
  }
  return dotPath(prefix);
}

export function renameMap(changes: TreeChange[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const change of changes) {
    if (!isIdenticalRename(change) || change.from === change.to) {
      continue;
    }
    for (const [start, end] of Array.from(map.entries())) {
      if (end === change.from) {
        map.set(start, change.to);
      }
    }
    if (!map.has(change.from)) {
      map.set(change.from, change.to);
    }
  }
  return map;
}

function baselineBefore(root: string, createdAt: string): string {
  const noteTime = Date.parse(createdAt);
  if (!Number.isFinite(noteTime)) {
    return 'HEAD';
  }
  const result = git(root, [
    'rev-list',
    '-1',
    `--before=${new Date(noteTime).toISOString()}`,
    'HEAD',
  ]);
  const sha = result.status === 0 ? result.stdout.split('\n')[0] : '';
  return sha || EMPTY_TREE;
}

function parseNameStatus(stdout: string): TreeChange[] {
  const changes: TreeChange[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const parts = line.split('\t');
    const status = parts[0] || '';
    if (status.startsWith('R') || status.startsWith('C')) {
      if (!parts[1] || !parts[2]) {
        continue;
      }
      changes.push({ status, from: parts[1], to: parts[2] });
      continue;
    }
    if (!parts[1]) {
      continue;
    }
    changes.push({ status, from: parts[1], to: parts[1] });
  }
  return changes;
}

function pathExists(root: string, relative: string): boolean {
  return fs.existsSync(path.join(root, showPath(relative)));
}

function containsFiles(root: string, relative: string): boolean {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    return false;
  }
  const stat = fs.statSync(absolute);
  if (!stat.isDirectory()) {
    return true;
  }
  const pending = [absolute];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      break;
    }
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile()) {
        return true;
      }
      if (entry.isDirectory()) {
        pending.push(path.join(current, entry.name));
      }
    }
  }
  return false;
}

function blobHash(
  root: string,
  treeish: string,
  relative: string,
): string | null {
  const result = git(root, ['rev-parse', `${treeish}:${relative}`]);
  if (result.status !== 0 || !result.stdout) {
    return null;
  }
  return result.stdout.split('\n')[0];
}

function worktreeHash(root: string, relative: string): string | null {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    return null;
  }
  const result = git(root, ['hash-object', '--', relative]);
  if (result.status !== 0 || !result.stdout) {
    return null;
  }
  return result.stdout.split('\n')[0];
}

function untrackedFiles(root: string): string[] {
  const result = git(root, ['ls-files', '--others', '--exclude-standard']);
  if (result.status !== 0) {
    return [];
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function pairUntrackedCopies(
  root: string,
  from: string,
  changes: TreeChange[],
): TreeChange[] {
  const deleted = changes
    .filter((change) => change.status === 'D')
    .map((change) => change.from);
  const added = untrackedFiles(root);
  const matches: TreeChange[] = [];
  const usedDest = new Set<string>();
  for (const source of deleted) {
    const previous = blobHash(root, from, source);
    if (!previous) {
      continue;
    }
    const hits = added.filter((candidate) => {
      if (usedDest.has(candidate)) {
        return false;
      }
      return worktreeHash(root, candidate) === previous;
    });
    if (hits.length !== 1) {
      continue;
    }
    usedDest.add(hits[0]);
    matches.push({ status: 'R100', from: source, to: hits[0] });
  }
  if (matches.length === 0) {
    return changes;
  }
  const sources = new Set(matches.map((change) => change.from));
  const destinations = new Set(matches.map((change) => change.to));
  const kept = changes.filter((change) => {
    if (change.status === 'D' && sources.has(change.from)) {
      return false;
    }
    if (change.status === 'A' && destinations.has(change.to)) {
      return false;
    }
    return true;
  });
  return kept.concat(matches);
}
