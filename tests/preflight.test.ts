import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callTool } from '../src/mcp';
import { withLepper } from '../src/notes/session';
import { recordNote } from '../src/notes/notes';
import preflightCommand from '../src/preflight/cli';
import { formatPreflight, preflightReport } from '../src/preflight/preflight';
import { addTodo, completeTodo } from '../src/todos/todos';
import { createGitRepo, git, removeTempDir } from './helpers';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

function write(root: string, relative: string, body: string): void {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, body);
}

function commitAt(cwd: string, message: string, when: string): void {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_AUTHOR_DATE: when,
    GIT_COMMITTER_DATE: when,
  };
  delete env.GIT_DIR;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  delete env.GIT_PREFIX;
  const result = spawnSync('git', ['commit', '-m', message], {
    cwd,
    encoding: 'utf8',
    env,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'git commit failed');
  }
}

function seedPayments(root: string): void {
  write(
    root,
    'src/payments/service.js',
    `export function getInvoice(id) {
  return id;
}
`,
  );
  write(
    root,
    'src/payments/caller.js',
    `import { getInvoice } from './service';

export function loadInvoice(id) {
  return getInvoice(id);
}
`,
  );
  write(
    root,
    'src/payments/service.test.js',
    `import { getInvoice } from './service';

export function testGetInvoice() {
  return getInvoice('inv');
}
`,
  );
  write(
    root,
    'src/payments/webhook/retry.test.js',
    `import { getInvoice } from '../service';

export function testRetry() {
  return getInvoice('inv');
}
`,
  );
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'add payments']);
}

describe('preflight', () => {
  it('briefs notes, active work, affected code, and later drift', () => {
    const root = createGitRepo();
    dirs.push(root);
    seedPayments(root);

    withLepper(root, (store) => {
      recordNote(store, {
        path: 'src/payments/service.js',
        note: 'Payment retries are intentionally handled here.',
      });
      recordNote(store, {
        path: 'src/payments',
        note: 'Do not move Stripe calls into controllers.',
      });
      recordNote(store, {
        path: 'src/other',
        note: 'Unrelated cache note.',
      });
      const active = addTodo(store, {
        title: 'Replace retry implementation',
        body: 'Touch src/payments/service.js',
      });
      const finished = addTodo(store, {
        title: 'Old retry cleanup',
        body: 'src/payments/service.js',
      });
      completeTodo(store, finished.id);
      return active;
    });

    const fresh = withLepper(root, (store) =>
      preflightReport(root, store, {
        target: 'src/payments/service.js#getInvoice',
      }),
    );
    expect(fresh.targets[0]?.label).toBe('src/payments/service.js#getInvoice');
    expect(fresh.affected.files).toBe(3);
    expect(fresh.affected.callers).toBe(1);
    expect(fresh.affected.tests).toBe(2);
    expect(fresh.context.map((note) => note.body)).toEqual([
      'Payment retries are intentionally handled here.',
      'Do not move Stripe calls into controllers.',
    ]);
    expect(fresh.active.map((todo) => todo.title)).toEqual([
      'Replace retry implementation',
    ]);
    expect(fresh.stale).toEqual([]);
    expect(fresh.verification).toEqual([
      'src/payments/service.test.js',
      'src/payments/webhook/retry.test.js',
    ]);

    const freshText = formatPreflight(fresh);
    expect(freshText).toMatch(/^CHANGE PREFLIGHT\n/);
    expect(freshText).toContain(
      'Target:\n  src/payments/service.js#getInvoice',
    );
    expect(freshText).toContain('  3 files\n  1 caller\n  2 tests');
    expect(freshText).toContain(
      '  - Payment retries are intentionally handled here.',
    );
    expect(freshText).toContain('Potential stale knowledge:\n  None');
    expect(freshText).not.toContain('Unrelated cache note');
    expect(freshText).not.toContain('Old retry cleanup');

    write(
      root,
      'src/payments/service.js',
      `export function getInvoice(id) {
  return id + '-edited';
}
`,
    );
    const dirty = withLepper(root, (store) =>
      preflightReport(root, store, {
        target: 'src/payments/service.js#getInvoice',
      }),
    );
    expect(dirty.stale).toEqual([
      {
        count: 1,
        path: 'src/payments/service.js',
        commit: undefined,
        uncommitted: true,
      },
    ]);
    expect(formatPreflight(dirty)).toContain(
      '1 note based on src/payments/service.js with uncommitted changes',
    );

    const diff = withLepper(root, (store) =>
      preflightReport(root, store, { diff: true }),
    );
    expect(diff.mode).toBe('diff');
    expect(diff.targets.map((target) => target.label)).toContain(
      'src/payments/service.js',
    );
    expect(formatPreflight(diff)).toContain('  working tree diff');

    git(root, ['add', 'src/payments/service.js']);
    commitAt(root, 'change invoice', '2099-01-01T00:00:00Z');
    const sha = git(root, ['rev-parse', '--short=7', 'HEAD']);
    const stale = withLepper(root, (store) =>
      preflightReport(root, store, {
        target: 'src/payments/service.js',
      }),
    );
    expect(stale.stale).toEqual([
      {
        count: 1,
        path: 'src/payments/service.js',
        commit: sha,
        uncommitted: false,
      },
    ]);
    expect(formatPreflight(stale)).toContain(
      `1 note based on src/payments/service.js before commit ${sha}`,
    );
    expect(() =>
      withLepper(root, (store) => preflightReport(root, store, { diff: true })),
    ).toThrow(/No changes in the working tree/);
  });

  it('rejects a missing target and a target combined with --diff', () => {
    const root = createGitRepo();
    dirs.push(root);
    expect(() =>
      withLepper(root, (store) => preflightReport(root, store, {})),
    ).toThrow(/preflight requires/);
    expect(() =>
      withLepper(root, (store) =>
        preflightReport(root, store, {
          target: 'src/payments/service.js',
          diff: true,
        }),
      ),
    ).toThrow(/not both/);
  });

  it('prints from the CLI and answers the MCP tool', () => {
    const root = createGitRepo();
    dirs.push(root);
    seedPayments(root);
    withLepper(root, (store) =>
      recordNote(store, {
        path: 'src/payments/service.js',
        note: 'Payment retries are intentionally handled here.',
      }),
    );

    const logs: string[] = [];
    const spy = vi
      .spyOn(console, 'log')
      .mockImplementation((message?: unknown) => {
        logs.push(String(message ?? ''));
      });
    preflightCommand({
      cwd: root,
      target: 'src/payments/service.js#getInvoice',
      json: true,
    });
    spy.mockRestore();

    const printed = JSON.parse(logs[0] || '{}') as {
      affected?: { callers?: number };
      context?: Array<{ body: string }>;
    };
    expect(printed.affected?.callers).toBe(1);
    expect(printed.context?.[0]?.body).toMatch(/Payment retries/);

    const briefed = callTool(
      'preflight',
      { target: 'src/payments/service.js#getInvoice' },
      root,
    );
    expect(briefed.isError).toBeFalsy();
    expect(briefed.content[0]?.text).toContain('CHANGE PREFLIGHT');
    expect(briefed.content[0]?.text).toContain('Suggested verification');
  });
});
