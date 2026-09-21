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

export interface SearchDoc {
  path: string;
  tf: Record<string, number>;
}

export interface SearchIndex {
  version: number;
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
