import { fingerprint } from '../utils/fingerprint';
import {
  changesSince,
  clearRenameCache,
  relocatedPath,
} from '../utils/renames';
import { excerpt } from '../utils/text';
import {
  readIndex,
  readNoteBlob,
  readRules,
  Store,
  writeIndex,
  writeNoteBlob,
  writeRules,
} from '../utils/store';
import { NoteBlob, NoteSummary, RuleItem } from '../utils/types';
import { rebuildSearchIndex } from './notes';

function summaryFrom(note: NoteBlob): NoteSummary {
  return {
    fingerprint: note.fingerprint,
    path: note.path,
    title: note.title,
    excerpt: excerpt(note.body),
    tags: note.tags,
    parent: note.parent,
    createdAt: note.createdAt,
    agent: note.agent,
  };
}

function retargetNote(blob: NoteBlob, nextPath: string): NoteBlob {
  const payload = {
    path: nextPath,
    title: blob.title,
    body: blob.body,
    tags: blob.tags,
    parent: blob.fingerprint,
    createdAt: blob.createdAt,
    agent: blob.agent || null,
    kind: 'note' as const,
  };
  return {
    fingerprint: fingerprint(payload),
    path: nextPath,
    title: blob.title,
    body: blob.body,
    tags: blob.tags,
    parent: blob.fingerprint,
    createdAt: blob.createdAt,
    agent: blob.agent,
    kind: 'note',
  };
}

function chainContains(
  store: Store,
  tip: string,
  fingerprintId: string,
): boolean {
  const seen = new Set<string>();
  let cursor: string | null = tip;
  while (cursor && !seen.has(cursor)) {
    if (cursor === fingerprintId) {
      return true;
    }
    seen.add(cursor);
    const blob = readNoteBlob(store, cursor);
    cursor = blob ? blob.parent : null;
  }
  return false;
}

function followNotes(store: Store): boolean {
  const index = readIndex(store);
  const notes = { ...index.notes };
  const planned: Array<{ from: string; to: string; summary: NoteSummary }> = [];
  for (const summary of Object.values(notes)) {
    const next = relocatedPath(
      store.root,
      summary.path,
      changesSince(store.root, summary.createdAt),
    );
    if (!next || next === summary.path) {
      continue;
    }
    planned.push({ from: summary.path, to: next, summary });
  }

  let changed = false;
  for (const move of planned) {
    const occupied = notes[move.to];
    if (occupied) {
      if (
        chainContains(store, occupied.fingerprint, move.summary.fingerprint)
      ) {
        delete notes[move.from];
        changed = true;
      }
      continue;
    }
    const blob = readNoteBlob(store, move.summary.fingerprint);
    if (!blob) {
      continue;
    }
    const note = retargetNote(blob, move.to);
    writeNoteBlob(store, note);
    delete notes[move.from];
    notes[move.to] = summaryFrom(note);
    changed = true;
  }

  if (!changed) {
    return false;
  }
  writeIndex(store, { ...index, notes });
  rebuildSearchIndex(store);
  return true;
}

function retargetRule(rule: RuleItem, from: string, to: string): RuleItem {
  const updatedAt = new Date().toISOString();
  const payload = {
    from,
    to,
    note: rule.note,
    createdAt: rule.createdAt,
    agent: rule.agent || null,
  };
  return {
    ...rule,
    from,
    to,
    fingerprint: fingerprint(payload),
    updatedAt,
  };
}

function followRules(store: Store): boolean {
  const index = readRules(store);
  let changed = false;
  for (const rule of Object.values(index.rules)) {
    const changes = changesSince(store.root, rule.createdAt);
    const from = relocatedPath(store.root, rule.from, changes) || rule.from;
    const to = relocatedPath(store.root, rule.to, changes) || rule.to;
    if ((from === rule.from && to === rule.to) || from === to) {
      continue;
    }
    index.rules[rule.id] = retargetRule(rule, from, to);
    changed = true;
  }
  if (changed) {
    writeRules(store, index);
  }
  return changed;
}

/** Point notes and rules at a path that was renamed without a content change. */
export function followMovedPaths(store: Store): boolean {
  clearRenameCache();
  const notes = followNotes(store);
  const rules = followRules(store);
  return notes || rules;
}
