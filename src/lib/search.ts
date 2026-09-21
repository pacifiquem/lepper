import { CliError } from './errors';
import { readNoteBlob, readSearchIndex, Store } from './store';
import { tokenize } from './text';
import { FindHit } from './types';
import { getNote, listNotes } from './notes';
import { normalizeProjectPath } from './paths';

export interface FindOptions {
  query: string;
  limit?: number;
  path?: string;
}

function relatedTf(queryToken: string, tf: Record<string, number>): number {
  let sum = 0;
  for (const docToken of Object.keys(tf)) {
    const related =
      docToken === queryToken ||
      (queryToken.length >= 4 &&
        (docToken.startsWith(queryToken) || queryToken.startsWith(docToken)));
    if (related) {
      sum += tf[docToken] || 0;
    }
  }
  return sum;
}

export function findNotes(store: Store, options: FindOptions): FindHit[] {
  const query = options.query.trim();
  if (!query) {
    throw new CliError('Find query cannot be empty.');
  }

  const tokens = tokenize(query);
  const queryText = query.toLowerCase();
  const scope = options.path
    ? normalizeProjectPath(options.path, store.root)
    : undefined;
  const limit = options.limit ?? 8;
  const search = readSearchIndex(store);
  const notes = listNotes(store);
  const latest = new Set(notes.map((note) => note.fingerprint));
  const docCount = Math.max(latest.size, 1);
  const scores = new Map<string, number>();

  const consider = (fingerprint: string, boost: number) => {
    if (!latest.has(fingerprint)) {
      return;
    }
    const doc = search.docs[fingerprint];
    if (!doc) {
      return;
    }
    if (scope && doc.path !== scope && !doc.path.startsWith(`${scope}/`)) {
      return;
    }
    scores.set(fingerprint, (scores.get(fingerprint) || 0) + boost);
  };

  if (tokens.length === 0) {
    for (const note of notes) {
      if (
        note.path.toLowerCase().includes(queryText) ||
        note.excerpt.toLowerCase().includes(queryText)
      ) {
        consider(note.fingerprint, 1);
      }
    }
  } else {
    for (const [fp, doc] of Object.entries(search.docs)) {
      let score = 0;
      for (const token of tokens) {
        const tf = relatedTf(token, doc.tf);
        if (tf === 0) {
          continue;
        }
        const df = search.df[token] || 1;
        const idf = Math.log(1 + docCount / df);
        score += tf * idf;
        if (doc.path.toLowerCase().includes(token)) {
          score += 4;
        }
      }
      if (score > 0) {
        consider(fp, score);
      }
    }
  }

  for (const note of notes) {
    if (scope && note.path !== scope && !note.path.startsWith(`${scope}/`)) {
      continue;
    }
    const haystack = `${note.path} ${note.title} ${
      note.excerpt
    } ${note.tags.join(' ')}`.toLowerCase();
    if (haystack.includes(queryText)) {
      consider(note.fingerprint, 6);
    }
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([fp, score]) => {
      const blob = readNoteBlob(store, fp);
      const summary = notes.find((note) => note.fingerprint === fp);
      const path = blob?.path || summary?.path || '';
      return {
        path,
        title: blob?.title || summary?.title || path,
        body: blob?.body || summary?.excerpt || '',
        fingerprint: fp,
        score: Number(score.toFixed(3)),
        tags: blob?.tags || summary?.tags || [],
      };
    })
    .filter((hit) => hit.body.length > 0);
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
