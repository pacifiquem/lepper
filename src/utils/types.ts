export const STORE_VERSION = 1;
export const LEPPER_REF = 'refs/lepper/notes';
export const SHORT_FINGERPRINT_LENGTH = 12;

export interface NoteBlob {
  fingerprint: string;
  path: string;
  title: string;
  body: string;
  tags: string[];
  parent: string | null;
  createdAt: string;
  agent?: string;
  kind: 'note';
}

export interface NoteSummary {
  fingerprint: string;
  path: string;
  title: string;
  excerpt: string;
  tags: string[];
  parent: string | null;
  createdAt: string;
  agent?: string;
}

export interface LepperIndex {
  version: number;
  updatedAt: string;
  notes: Record<string, NoteSummary>;
}

export interface TodoItem {
  id: string;
  fingerprint: string;
  title: string;
  body: string;
  status: 'open' | 'doing' | 'done';
  parent: string | null;
  createdAt: string;
  updatedAt: string;
  agent?: string;
}

export interface TodoIndex {
  version: number;
  updatedAt: string;
  todos: Record<string, TodoItem>;
}

export interface RuleItem {
  id: string;
  fingerprint: string;
  /** Files under this path must not depend on `to`. */
  from: string;
  /** Imports and calls into this path are forbidden from `from`. */
  to: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  agent?: string;
}

export interface RuleIndex {
  version: number;
  updatedAt: string;
  rules: Record<string, RuleItem>;
}

export interface DiaryEntry {
  id: string;
  fingerprint: string;
  /** One line describing the work in that session. */
  work: string;
  wentWell: string[];
  wentWrong: string[];
  createdAt: string;
  agent?: string;
}

export interface DiaryIndex {
  version: number;
  updatedAt: string;
  entries: Record<string, DiaryEntry>;
}

export interface DiaryBrief {
  keep: string[];
  stop: string[];
  recent: Array<{
    id: string;
    work: string;
    createdAt: string;
    agent?: string;
  }>;
}

export const SEARCH_ANALYZER = 'bm25';

export interface SearchDoc {
  path: string;
  /** Stemmed term counts. Values are occurrences, not 0/1 flags. */
  tf: Record<string, number>;
  /** Number of indexed tokens. BM25 uses this as the document length. */
  length: number;
}

export interface SearchIndex {
  version: number;
  /**
   * Term analysis used to build `docs`. A missing or different value means
   * the index must be rebuilt before it can be scored.
   */
  analyzer?: string;
  df: Record<string, number>;
  docs: Record<string, SearchDoc>;
}

export interface MapNode {
  path: string;
  title?: string;
  excerpt?: string;
  fingerprint?: string;
  recorded: boolean;
  children: MapNode[];
}

export interface FindHit {
  path: string;
  title: string;
  body: string;
  fingerprint: string;
  score: number;
  tags: string[];
}
