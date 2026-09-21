import { bm25Score, bm25Stats } from './bm25';
import { CliError } from './errors';
import { readNoteBlob, Store } from './store';
import { tokenize } from './text';
import { FindHit, NoteSummary, SearchDoc } from './types';
import { ensureSearchIndex, getNote, listNotes } from './notes';
import { normalizeProjectPath } from './paths';

export interface FindOptions {
  query: string;
  limit?: number;
  path?: string;
}

function inScope(notePath: string, scope: string | undefined): boolean {
  if (!scope) {
    return true;
  }
  return notePath === scope || notePath.startsWith(`${scope}/`);
}

function toHit(
  store: Store,
  notes: NoteSummary[],
  fingerprint: string,
  score: number,
): FindHit | undefined {
  const blob = readNoteBlob(store, fingerprint);
  const summary = notes.find((note) => note.fingerprint === fingerprint);
  const path = blob?.path || summary?.path || '';
  const body = blob?.body || summary?.excerpt || '';
  if (!body) {
    return undefined;
  }

  return {
    path,
    title: blob?.title || summary?.title || path,
    body,
    fingerprint,
    score: Number(score.toFixed(3)),
    tags: blob?.tags || summary?.tags || [],
  };
}

function substringHits(
  store: Store,
  notes: NoteSummary[],
  query: string,
  scope: string | undefined,
  limit: number,
): FindHit[] {
  const needle = query.toLowerCase();
  const hits: FindHit[] = [];

  for (const note of notes) {
    if (!inScope(note.path, scope)) {
      continue;
    }
    const blob = readNoteBlob(store, note.fingerprint);
    const tags = blob?.tags || note.tags;
    const haystack = [
      note.path,
      blob?.title || note.title,
      blob?.body || note.excerpt,
      tags.join(' '),
    ]
      .join('\n')
      .toLowerCase();
    if (!haystack.includes(needle)) {
      continue;
    }
    const hit = toHit(store, notes, note.fingerprint, 1);
    if (!hit) {
      continue;
    }
    hits.push(hit);
    if (hits.length >= limit) {
      break;
    }
  }

  return hits;
}

export function findNotes(store: Store, options: FindOptions): FindHit[] {
  const query = options.query.trim();
  if (!query) {
    throw new CliError('Find query cannot be empty.');
  }

  const limit = options.limit ?? 8;
  const scope = options.path
    ? normalizeProjectPath(options.path, store.root)
    : undefined;
  const notes = listNotes(store);
  const index = ensureSearchIndex(store, notes);
  const queryTerms = tokenize(query);

  if (queryTerms.length === 0) {
    return substringHits(store, notes, query, scope, limit);
  }

  const corpus: SearchDoc[] = [];
  for (const note of notes) {
    const doc = index.docs[note.fingerprint];
    if (doc) {
      corpus.push(doc);
    }
  }
  const stats = bm25Stats(corpus);
  const ranked: Array<{ fingerprint: string; score: number }> = [];

  for (const note of notes) {
    if (!inScope(note.path, scope)) {
      continue;
    }
    const doc = index.docs[note.fingerprint];
    if (!doc) {
      continue;
    }
    const score = bm25Score(queryTerms, doc, stats);
    if (score > 0) {
      ranked.push({ fingerprint: note.fingerprint, score });
    }
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const pathA = index.docs[a.fingerprint]?.path || '';
    const pathB = index.docs[b.fingerprint]?.path || '';
    return pathA.localeCompare(pathB);
  });

  const hits: FindHit[] = [];
  for (const row of ranked.slice(0, limit)) {
    const hit = toHit(store, notes, row.fingerprint, row.score);
    if (hit) {
      hits.push(hit);
    }
  }
  return hits;
}

export function showNote(store: Store, inputPath: string): FindHit {
  const note = getNote(store, inputPath);
  if (!note) {
    throw new CliError(`No note recorded for ${inputPath}.`);
  }
  return {
    path: note.path,
    title: note.title,
    body: note.body,
    fingerprint: note.fingerprint,
    score: 1,
    tags: note.tags,
  };
}
