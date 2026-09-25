import fs from 'fs';
import path from 'path';
import {
  isIgnoredDirName,
  normalizeProjectPath,
  readIgnoredDirNames,
} from '../utils/paths';

export function collectDirectories(cwd: string = process.cwd()): string[] {
  const results: string[] = [];
  const ignored = readIgnoredDirNames(cwd);

  const walk = (absoluteDir: string) => {
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || isIgnoredDirName(entry.name, ignored)) {
        continue;
      }

      const absolute = path.join(absoluteDir, entry.name);
      results.push(normalizeProjectPath(absolute, cwd));
      walk(absolute);
    }
  };

  walk(cwd);
  return results.sort();
}

export function findUndescribedDirectories(
  cwd: string,
  directories: Record<string, string> | undefined,
): string[] {
  const described = new Set<string>();

  for (const key of Object.keys(directories || {})) {
    described.add(normalizeProjectPath(key, cwd));
  }

  return collectDirectories(cwd).filter(
    (directory) => !described.has(directory),
  );
}
