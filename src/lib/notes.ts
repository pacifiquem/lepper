import { documentFrequencies } from './bm25';
import { CliError } from './errors';
import { fingerprint } from './fingerprint';
import { normalizeProjectPath } from './paths';
import {
  maybePack,
  readIndex,
  readNoteBlob,
  readSearchIndex,
  Store,
  writeIndex,
  writeNoteBlob,
  writeSearchIndex,
} from './store';
import { excerpt, titleFrom, tokenize, termFrequency } from './text';
import {
  NoteBlob,
  NoteSummary,
  SEARCH_ANALYZER,
  SearchDoc,
  SearchIndex,
  STORE_VERSION,
} from './types';

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
  index.notes[normalized] = summaryFrom(note);
  writeIndex(store, index);
  rebuildSearchIndex(store);
  maybePack(store);
  return note;
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
