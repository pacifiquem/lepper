import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callTool } from '../src/mcp';
import { withLepper } from '../src/notes/session';
import { recordNote } from '../src/notes/notes';
import preflightCommand from '../src/preflight/cli';
import {
  formatPreflight,
  isTestPath,
  preflightReport,
} from '../src/preflight/preflight';
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

function gitAt(cwd: string, args: string[], when: string): void {
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
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args[0]} failed`);
  }
}

function commitAt(cwd: string, message: string, when: string): void {
  gitAt(cwd, ['commit', '-m', message], when);
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

describe('isTestPath', () => {
  it('recognizes test file names and test directories', () => {
    expect(isTestPath('src/payments/service.test.js')).toBe(true);
    expect(isTestPath('src/payments/filename.spec.ts')).toBe(true);
    expect(isTestPath('tests/filename.ts')).toBe(true);
    expect(isTestPath('test/filename.ts')).toBe(true);
    expect(isTestPath('src/__tests__/filename.ts')).toBe(true);
    expect(isTestPath('spec/filename.ts')).toBe(true);
    expect(isTestPath('src/payments/service.ts')).toBe(false);
    expect(isTestPath('src/latest/score.ts')).toBe(false);
    expect(isTestPath('src/contest/score.ts')).toBe(false);
    expect(isTestPath('src/test-utils/helper.ts')).toBe(false);
  });
});

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
    expect(dirty.context.map((note) => note.path)).toEqual([]);
    expect(dirty.stale).toEqual([
      {
        count: 1,
        path: 'src/payments/service.js',
        commit: undefined,
        uncommitted: true,
        bodies: ['Payment retries are intentionally handled here.'],
      },
      {
        count: 1,
        path: 'src/payments',
        commit: undefined,
        uncommitted: true,
        bodies: ['Do not move Stripe calls into controllers.'],
      },
    ]);
    expect(formatPreflight(dirty)).toContain(
      '1 note based on src/payments/service.js with uncommitted changes',
    );
    expect(formatPreflight(dirty)).toContain(
      '1 note based on src/payments with uncommitted changes',
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
    expect(stale.context.map((note) => note.path)).toEqual([]);
    expect(stale.stale).toEqual([
      {
        count: 1,
        path: 'src/payments/service.js',
        commit: sha,
        uncommitted: false,
        bodies: ['Payment retries are intentionally handled here.'],
      },
      {
        count: 1,
        path: 'src/payments',
        commit: sha,
        uncommitted: false,
        bodies: ['Do not move Stripe calls into controllers.'],
      },
    ]);
    expect(formatPreflight(stale)).toContain(
      `1 note based on src/payments/service.js before commit ${sha}`,
    );
    expect(formatPreflight(stale)).toContain(
      `1 note based on src/payments before commit ${sha}`,
    );
    expect(() =>
      withLepper(root, (store) => preflightReport(root, store, { diff: true })),
    ).toThrow(/No changes in the working tree/);
  });

  it('marks a folder note stale only when something inside that folder changes', () => {
    const root = createGitRepo();
    dirs.push(root);
    write(
      root,
      'src/payments/payouts.js',
      `export function disburse() {
  return 'automatic';
}
`,
    );
    write(
      root,
      'src/billing/invoice.js',
      `export function total() {
  return 1;
}
`,
    );
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'add payouts']);
    withLepper(root, (store) =>
      recordNote(store, {
        path: 'src/payments',
        note: 'Implemented automatic payouts disbursing money each 3 days.',
      }),
    );

    const before = withLepper(root, (store) =>
      preflightReport(root, store, { target: 'src/payments/payouts.js' }),
    );
    expect(before.stale).toEqual([]);
    expect(before.context.map((note) => note.body)).toEqual([
      'Implemented automatic payouts disbursing money each 3 days.',
    ]);

    write(
      root,
      'src/billing/invoice.js',
      `export function total() {
  return 2;
}
`,
    );
    git(root, ['add', 'src/billing/invoice.js']);
    commitAt(root, 'change billing', '2099-01-01T00:00:00Z');
    const outside = withLepper(root, (store) =>
      preflightReport(root, store, { target: 'src/payments/payouts.js' }),
    );
    expect(outside.stale).toEqual([]);
    expect(outside.context).toHaveLength(1);

    write(
      root,
      'src/payments/payouts.js',
      `export function disburse() {
  return 'manual';
}
`,
    );
    git(root, ['add', 'src/payments/payouts.js']);
    commitAt(root, 'manual payouts', '2099-06-01T00:00:00Z');
    const sha = git(root, ['rev-parse', '--short=7', 'HEAD']);
    const drifted = withLepper(root, (store) =>
      preflightReport(root, store, { target: 'src/payments' }),
    );
    expect(drifted.context).toEqual([]);
    expect(drifted.stale).toEqual([
      {
        count: 1,
        path: 'src/payments',
        commit: sha,
        uncommitted: false,
        bodies: ['Implemented automatic payouts disbursing money each 3 days.'],
      },
    ]);
    expect(formatPreflight(drifted)).toContain(
      `1 note based on src/payments before commit ${sha}`,
    );
    expect(formatPreflight(drifted)).toContain(
      'Implemented automatic payouts disbursing money each 3 days.',
    );
    expect(formatPreflight(drifted)).toContain('Known context:\n  None');
  });

  it('counts a tests/ directory file as verification rather than a caller', () => {
    const root = createGitRepo();
    dirs.push(root);
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
      'tests/filename.ts',
      `import { getInvoice } from '../src/payments/service';

export function charge() {
  return getInvoice('inv');
}
`,
    );
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'add tests layout']);

    const report = withLepper(root, (store) =>
      preflightReport(root, store, {
        target: 'src/payments/service.js#getInvoice',
      }),
    );
    expect(report.affected.callers).toBe(1);
    expect(report.affected.tests).toBe(1);
    expect(report.verification).toEqual(['tests/filename.ts']);
    expect(formatPreflight(report)).toContain('  - tests/filename.ts');
    expect(formatPreflight(report)).not.toContain('1 caller\n  0 tests');

    const folder = withLepper(root, (store) =>
      preflightReport(root, store, { target: 'src/payments' }),
    );
    expect(folder.targets[0]?.label).toBe('src/payments');
    expect(folder.affected.callers).toBe(1);
    expect(folder.affected.tests).toBe(1);
    expect(folder.verification).toEqual(['tests/filename.ts']);
  });

  it('marks a directory note stale when a merge commit changes a nested file', () => {
    const root = createGitRepo();
    dirs.push(root);
    const base = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
    write(
      root,
      'src/payments/deep.js',
      `export function disburse() {
  return 'every-3-days';
}
`,
    );
    git(root, ['add', '.']);
    commitAt(root, 'init payments', '2020-01-01T00:00:00Z');
    git(root, ['checkout', '-b', 'feature']);
    write(
      root,
      'src/payments/deep.js',
      `export function disburse() {
  return 'manual';
}
`,
    );
    git(root, ['add', '.']);
    commitAt(root, 'change payouts on feature', '2019-06-01T00:00:00Z');
    git(root, ['checkout', base]);
    write(root, 'src/other/keep.js', 'export const keep = true;\n');
    git(root, ['add', '.']);
    commitAt(root, 'keep main moving', '2020-02-01T00:00:00Z');
    withLepper(root, (store) =>
      recordNote(store, {
        path: 'src/payments',
        note: 'implemented automatic payouts disbursing money each 3 days',
      }),
    );

    gitAt(
      root,
      ['merge', '--no-ff', 'feature', '-m', 'merge feature'],
      '2099-08-01T00:00:00Z',
    );
    const sha = git(root, ['rev-parse', '--short=7', 'HEAD']);
    const report = withLepper(root, (store) =>
      preflightReport(root, store, { target: 'src/payments/deep.js' }),
    );
    expect(report.context).toEqual([]);
    expect(report.stale).toEqual([
      {
        count: 1,
        path: 'src/payments',
        commit: sha,
        uncommitted: false,
        bodies: ['implemented automatic payouts disbursing money each 3 days'],
      },
    ]);
  });

  it('keeps a directory note in --diff when the file is renamed out', () => {
    const root = createGitRepo();
    dirs.push(root);
    write(
      root,
      'src/payments/a/b/deep.js',
      `export function disburse() {
  return 'every-3-days';
}
`,
    );
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'add deep']);
    withLepper(root, (store) =>
      recordNote(store, {
        path: 'src/payments',
        note: 'implemented automatic payouts disbursing money each 3 days',
      }),
    );
    fs.mkdirSync(path.join(root, 'src/billing'), { recursive: true });
    git(root, ['mv', 'src/payments/a/b/deep.js', 'src/billing/deep.js']);

    const report = withLepper(root, (store) =>
      preflightReport(root, store, { diff: true }),
    );
    expect(report.targets.map((target) => target.label)).toEqual([
      'src/billing/deep.js',
      'src/payments/a/b/deep.js',
    ]);
    expect(report.context).toEqual([]);
    expect(report.stale.map((item) => item.path)).toEqual(['src/payments']);
    expect(report.stale[0]?.uncommitted).toBe(true);
  });

  it('applies a repository-root note to a nested file that later changes', () => {
    const root = createGitRepo();
    dirs.push(root);
    write(
      root,
      'src/payments/deep.js',
      `export function disburse() {
  return 'every-3-days';
}
`,
    );
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'add deep']);
    withLepper(root, (store) =>
      recordNote(store, {
        path: '.',
        note: 'implemented automatic payouts disbursing money each 3 days',
      }),
    );

    const fresh = withLepper(root, (store) =>
      preflightReport(root, store, { target: 'src/payments/deep.js' }),
    );
    expect(fresh.stale).toEqual([]);
    expect(fresh.context.map((note) => note.body)).toEqual([
      'implemented automatic payouts disbursing money each 3 days',
    ]);

    write(
      root,
      'src/payments/deep.js',
      `export function disburse() {
  return 'manual';
}
`,
    );
    const drifted = withLepper(root, (store) =>
      preflightReport(root, store, { target: 'src/payments/deep.js' }),
    );
    expect(drifted.context).toEqual([]);
    expect(drifted.stale).toEqual([
      {
        count: 1,
        path: '.',
        commit: undefined,
        uncommitted: true,
        bodies: ['implemented automatic payouts disbursing money each 3 days'],
      },
    ]);
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
