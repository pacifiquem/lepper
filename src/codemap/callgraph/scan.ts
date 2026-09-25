import fs from 'fs';
import path from 'path';
import { languageFor, supportedExtensions } from '../languages/registry';
import {
  isIgnoredDirName,
  normalizeProjectPath,
  readIgnoredDirNames,
} from '../../utils/paths';

const SOURCE_EXTENSIONS = new Set(supportedExtensions);

export const MAX_FILE_BYTES = 300_000;
export const MAX_FILES = 4_000;
export const MAX_DEPENDENTS = 100;
export const DEFAULT_DEPTH = 4;
export const MAX_DEPTH = 20;

const EXTRA_IGNORED_DIRS = [
  'dist',
  'build',
  'coverage',
  'compiled',
  'vendor',
  'target',
  '__pycache__',
];

export function languageOf(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(ext)) {
    return null;
  }
  return languageFor(filePath)?.id || null;
}

export function collectSourceFiles(root: string): {
  files: string[];
  truncated: boolean;
} {
  const ignored = readIgnoredDirNames(root);
  for (const name of EXTRA_IGNORED_DIRS) {
    ignored.add(name);
  }

  const files: string[] = [];
  let truncated = false;

  const walk = (absoluteDir: string) => {
    if (truncated) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (truncated) {
        return;
      }
      if (entry.isDirectory()) {
        if (isIgnoredDirName(entry.name, ignored)) {
          continue;
        }
        walk(path.join(absoluteDir, entry.name));
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (entry.name.endsWith('.d.ts')) {
        continue;
      }
      if (!languageOf(entry.name)) {
        continue;
      }
      const absolute = path.join(absoluteDir, entry.name);
      let size = 0;
      try {
        size = fs.statSync(absolute).size;
      } catch {
        continue;
      }
      if (size > MAX_FILE_BYTES) {
        continue;
      }
      files.push(normalizeProjectPath(absolute, root));
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
    }
  };

  walk(root);
  files.sort();
  return { files, truncated };
}
