import fs from 'fs';
import path from 'path';
import { CliError } from './errors';

const ALWAYS_IGNORED_DIR_NAMES = new Set(['node_modules']);

export function normalizeProjectPath(
  inputPath: string,
  cwd: string = process.cwd(),
): string {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new CliError('Directory path cannot be empty.');
  }

  const absolute = path.resolve(cwd, inputPath.trim());
  let relative = path.relative(cwd, absolute).split(path.sep).join('/');

  if (relative === '') {
    return '.';
  }

  if (relative.endsWith('/')) {
    relative = relative.slice(0, -1);
  }

  if (!relative.startsWith('..') && !path.posix.isAbsolute(relative)) {
    relative = `./${relative}`;
  }

  return relative;
}

export function normalizeDirectoryMap(
  directories: Record<string, string> | undefined,
  cwd: string = process.cwd(),
): Record<string, string> {
  const normalized: Record<string, string> = {};

  if (!directories) {
    return normalized;
  }

  for (const [key, value] of Object.entries(directories)) {
    const pathKey = normalizeProjectPath(key, cwd);
    normalized[pathKey] = value == null ? '' : String(value);
  }

  return normalized;
}

export function readIgnoredDirNames(cwd: string = process.cwd()): Set<string> {
  const ignored = new Set<string>(ALWAYS_IGNORED_DIR_NAMES);
  const gitignorePath = path.join(cwd, '.gitignore');

  if (!fs.existsSync(gitignorePath)) {
    return ignored;
  }

  let content = '';
  try {
    content = fs.readFileSync(gitignorePath, 'utf-8');
  } catch {
    return ignored;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) {
      continue;
    }

    const pattern = line.replace(/^\//, '').replace(/\/$/, '');
    if (pattern && !pattern.includes('/') && !pattern.includes('*')) {
      ignored.add(pattern);
    }
  }

  return ignored;
}

export function isIgnoredDirName(
  name: string,
  extraIgnored: Set<string> = ALWAYS_IGNORED_DIR_NAMES,
): boolean {
  return name.startsWith('.') || extraIgnored.has(name);
}
