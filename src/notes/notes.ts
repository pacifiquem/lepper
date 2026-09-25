import { documentFrequencies } from '../search/bm25';
import {
  compareNoteVersions,
  noteVersionKey,
  preferNoteVersion,
  relinkNote,
} from '../utils/chain';
import { CliError } from '../utils/errors';
import { fingerprint } from '../utils/fingerprint';
import { normalizeProjectPath } from '../utils/paths';
import {
  maybePack,
  readAllNoteBlobs,
  readIndex,
  readNoteBlob,
  readSearchIndex,
  Store,
  writeIndex,
  writeNoteBlob,
  writeSearchIndex,
} from '../utils/store';
import { excerpt, titleFrom, tokenize, termFrequency } from '../utils/text';
import {
  NoteBlob,
  NoteSummary,
  SEARCH_ANALYZER,
  SearchDoc,
  SearchIndex,
  STORE_VERSION,
} from '../utils/types';

export interface RecordInput {
  path: string;
  note: string;
  title?: string;
  tags?: string[];
  agent?: string;
}

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

function searchTokens(note: NoteBlob): string[] {
  return [
    ...tokenize(note.body),
    ...tokenize(note.title),
    ...tokenize(note.path),
    ...note.tags.flatMap((tag) => tokenize(tag)),
  ];
}

function noteSearchDoc(note: NoteBlob): SearchDoc {
  const tokens = searchTokens(note);
  return {
    path: note.path,
    tf: termFrequency(tokens),
    length: tokens.length,
  };
}

function isCurrentSearchIndex(
  index: SearchIndex,
  notes: NoteSummary[],
): boolean {
  if (index.analyzer !== SEARCH_ANALYZER) {
    return false;
  }

  const docs = index.docs || {};
  if (Object.keys(docs).length !== notes.length) {
    return false;
  }

  for (const note of notes) {
    const doc = docs[note.fingerprint];
    if (!doc || doc.path !== note.path || typeof doc.length !== 'number') {
      return false;
    }
  }

  return true;
}

export function rebuildSearchIndex(
  store: Store,
  notes: NoteSummary[] = listNotes(store),
): SearchIndex {
  const docs: Record<string, SearchDoc> = {};
  for (const summary of notes) {
    const blob = readNoteBlob(store, summary.fingerprint);
    if (!blob) {
      continue;
    }
    docs[blob.fingerprint] = noteSearchDoc(blob);
  }

  const index: SearchIndex = {
    version: STORE_VERSION,
    analyzer: SEARCH_ANALYZER,
    df: documentFrequencies(Object.values(docs)),
    docs,
  };
  writeSearchIndex(store, index);
  return index;
}

export function ensureSearchIndex(
  store: Store,
  notes: NoteSummary[] = listNotes(store),
): SearchIndex {
  const index = readSearchIndex(store);
  if (isCurrentSearchIndex(index, notes)) {
    return index;
  }
  return rebuildSearchIndex(store, notes);
}

export function recordNote(store: Store, input: RecordInput): NoteBlob {
  const body = input.note.trim();
  if (!body) {
    throw new CliError('Note text cannot be empty.');
  }

  const normalized = normalizeProjectPath(input.path, store.root);
  const index = readIndex(store);
  const current = index.notes[normalized];
  const createdAt = new Date().toISOString();
  const title =
    input.title?.trim() ||
    titleFrom(body, normalized === '.' ? 'project' : normalized);
  const tags = (input.tags || [])
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  const agent = input.agent?.trim() || process.env.LEPPER_AGENT || undefined;

  const payload = {
    path: normalized,
    title,
    body,
    tags,
    parent: current?.fingerprint ?? null,
    createdAt,
    agent: agent || null,
    kind: 'note',
  };

  const note: NoteBlob = {
    fingerprint: fingerprint(payload),
    path: normalized,
    title,
    body,
    tags,
    parent: current?.fingerprint ?? null,
    createdAt,
    agent,
    kind: 'note',
  };

  writeNoteBlob(store, note);
  recoverStoredNotes(store);
  rebuildSearchIndex(store);
  maybePack(store);

  const saved = historyFor(store, normalized).find(
    (item) => noteVersionKey(item) === noteVersionKey(note),
  );
  return saved || note;
}

/**
 * Link every stored note body into its path chain. A concurrent record can
 * replace index.json and leave the other agent's blob unreferenced; this puts
 * that blob back on the chain instead of letting publish delete it.
 */
export function recoverStoredNotes(store: Store): boolean {
  const index = readIndex(store);
  const onChain = new Set<string>();
  for (const summary of Object.values(index.notes)) {
    const seen = new Set<string>();
    let cursor: string | null = summary.fingerprint;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      onChain.add(cursor);
      const blob = readNoteBlob(store, cursor);
      cursor = blob ? blob.parent : null;
    }
  }

  const byPath = new Map<string, NoteBlob[]>();
  for (const blob of readAllNoteBlobs(store)) {
    const list = byPath.get(blob.path) || [];
    list.push(blob);
    byPath.set(blob.path, list);
  }

  const notes = { ...index.notes };
  let changed = false;
  for (const [pathKey, group] of Array.from(byPath.entries())) {
    const tip = unifyNoteBlobs(store, group, onChain);
    if (!tip) {
      continue;
    }
    if (notes[pathKey]?.fingerprint !== tip.fingerprint) {
      notes[pathKey] = summaryFrom(tip);
      changed = true;
    }
  }

  if (changed) {
    writeIndex(store, { ...index, notes });
  }
  return changed;
}

export function unifyNoteBlobs(
  store: Store,
  blobs: NoteBlob[],
  onChain?: ReadonlySet<string>,
): NoteBlob | undefined {
  const chosen = new Map<string, NoteBlob>();
  for (const blob of blobs) {
    const key = noteVersionKey(blob);
    const current = chosen.get(key);
    chosen.set(key, current ? preferNoteVersion(current, blob, onChain) : blob);
  }

  const versions = Array.from(chosen.values()).sort(compareNoteVersions);
  if (versions.length === 0) {
    return undefined;
  }

  const members = new Set<string>();
  for (const blob of versions) {
    members.add(blob.fingerprint);
  }

  let previous: string | null = null;
  const oldestParent = versions[0].parent;
  if (oldestParent && !members.has(oldestParent)) {
    previous = oldestParent;
  }

  let tip: NoteBlob | undefined;
  for (const blob of versions) {
    const next = blob.parent === previous ? blob : relinkNote(blob, previous);
    if (next.fingerprint !== blob.fingerprint) {
      writeNoteBlob(store, next);
    }
    previous = next.fingerprint;
    tip = next;
  }
  return tip;
}

export function getNote(store: Store, inputPath: string): NoteBlob | undefined {
  const normalized = normalizeProjectPath(inputPath, store.root);
  const summary = readIndex(store).notes[normalized];
  if (!summary) {
    return undefined;
  }
  return readNoteBlob(store, summary.fingerprint);
}

export function listNotes(store: Store): NoteSummary[] {
  return Object.values(readIndex(store).notes).sort((a, b) =>
    a.path.localeCompare(b.path),
  );
}

export function historyFor(store: Store, inputPath: string): NoteBlob[] {
  const normalized = normalizeProjectPath(inputPath, store.root);
  const latest = readIndex(store).notes[normalized];
  if (!latest) {
    return [];
  }

  const chain: NoteBlob[] = [];
  const seen = new Set<string>();
  let cursor: string | null = latest.fingerprint;

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const blob = readNoteBlob(store, cursor);
    if (!blob) {
      break;
    }
    chain.push(blob);
    cursor = blob.parent;
  }

  return chain;
}
