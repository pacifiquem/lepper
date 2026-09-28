import fs from 'fs';
import path from 'path';
import { afterAll, bench, describe } from 'vitest';
import { blastRadius } from '../src/codemap/callgraph/blast';
import { codeMap } from '../src/codemap/callgraph/graph';
import { recallDiary, writeDiaryEntry } from '../src/diary/diary';
import { projectMap } from '../src/notes/map';
import { recordNote } from '../src/notes/notes';
import { withLepper } from '../src/notes/session';
import { syncNotes } from '../src/notes/sync';
import { preflightReport } from '../src/preflight/preflight';
import { checkRules } from '../src/rules/check';
import { addRule, listRules } from '../src/rules/rules';
import { findNotes } from '../src/search/search';
import { addTodo, listTodos } from '../src/todos/todos';
import { createGitRepo, removeTempDir } from './helpers';

function write(root: string, relative: string, body: string): void {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, body);
}

// Bench warmup starts before beforeAll, so the fixture has to exist at import.
const root = createGitRepo();
let recorded = 0;

write(
  root,
  'src/auth.js',
  `export function issue(user) {
  return user;
}
`,
);
write(
  root,
  'src/http.js',
  `import { issue } from './auth';

export function login(user) {
  return issue(user);
}
`,
);
withLepper(root, (store) => {
  recordNote(store, {
    path: 'src/auth.js',
    note: 'issue builds a session token and never stores the password.',
  });
  recordNote(store, {
    path: 'src/http.js',
    note: 'login calls issue and returns the token to the caller.',
  });
  addRule(store, {
    from: 'src/http.js',
    to: 'src/auth.js',
    note: 'HTTP may call auth.',
  });
  addTodo(store, {
    title: 'Cover login',
    body: 'Add a test for src/http.js login.',
  });
  writeDiaryEntry(store, {
    work: 'Mapped auth and login.',
    wentWell: ['Notes landed on the files that own the behavior.'],
    wentWrong: ['The first note named the wrong file.'],
  });
});

describe('lepper commands', () => {
  afterAll(() => {
    removeTempDir(root);
  });

  bench('record', () => {
    recorded += 1;
    withLepper(root, (store) =>
      recordNote(store, {
        path: `src/note-${recorded}.js`,
        note: `Recorded fact ${recorded} about session tokens.`,
      }),
    );
  });

  bench('map', () => {
    withLepper(root, (store) => projectMap(store));
  });

  bench('find', () => {
    withLepper(root, (store) =>
      findNotes(store, { query: 'session token', limit: 5 }),
    );
  });

  bench('codemap', () => {
    codeMap(root, { path: 'src' });
  });

  bench('blast', () => {
    blastRadius(root, 'src/auth.js#issue');
  });

  bench('preflight', () => {
    withLepper(root, (store) =>
      preflightReport(root, store, { target: 'src/auth.js' }),
    );
  });

  bench('check', () => {
    withLepper(root, (store) => checkRules(root, store));
  });

  bench('rule', () => {
    withLepper(root, (store) => listRules(store));
  });

  bench('diary', () => {
    withLepper(root, (store) => recallDiary(store));
  });

  bench('todo', () => {
    withLepper(root, (store) => listTodos(store));
  });

  bench('sync', () => {
    syncNotes(root);
  });
});
