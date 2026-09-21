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
import { NoteBlob, NoteSummary } from './types';

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

function indexNote(store: Store, note: NoteBlob): void {
  const search = readSearchIndex(store);
  const tokens = [
    ...tokenize(note.body),
    ...tokenize(note.title),
    ...tokenize(note.path),
    ...note.tags.flatMap((tag) => tokenize(tag)),
  ];
  const tf = termFrequency(tokens);

  if (search.docs[note.fingerprint]) {
    return;
  }

  search.docs[note.fingerprint] = { path: note.path, tf };
  for (const token of Object.keys(tf)) {
    search.df[token] = (search.df[token] || 0) + 1;
  }
  writeSearchIndex(store, search);
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
  indexNote(store, note);
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
