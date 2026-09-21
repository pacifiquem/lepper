import fs from 'fs';
import path from 'path';
import { recordNote } from './notes';
import { normalizeProjectPath } from './paths';
import { readIndex, Store } from './store';

export function migrateLegacyInfo(store: Store): number {
  const infoPath = path.join(store.root, '.lepper', '_info.json');
  if (!fs.existsSync(infoPath)) {
    return 0;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
  } catch {
    return 0;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 0;
  }

  const record = parsed as Record<string, unknown>;
  const directories = record.directories;
  if (
    !directories ||
    typeof directories !== 'object' ||
    Array.isArray(directories)
  ) {
    return 0;
  }

  let imported = 0;

  for (const [rawPath, value] of Object.entries(
    directories as Record<string, unknown>,
  )) {
    const body = value == null ? '' : String(value).trim();
    if (!body) {
      continue;
    }

    let normalized: string;
    try {
      normalized = normalizeProjectPath(rawPath, store.root);
    } catch {
      continue;
    }

    if (readIndex(store).notes[normalized]) {
      continue;
    }

    recordNote(store, {
      path: normalized,
      note: body,
      agent: 'migrate',
      tags: ['legacy'],
    });
    imported += 1;
  }

  return imported;
}

export function ensureMigrated(store: Store): number {
  const flag = path.join(store.dir, 'MIGRATED');
  if (fs.existsSync(flag)) {
    return 0;
  }

  const imported = migrateLegacyInfo(store);
  fs.writeFileSync(flag, `${new Date().toISOString()}\n`);
  return imported;
}
