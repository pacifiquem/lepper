import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callTool } from '../src/mcp';
import { withLepper } from '../src/notes/session';
import checkCommand from '../src/rules/cli-check';
import { checkRules } from '../src/rules/check';
import { addRule, listRules, removeRule } from '../src/rules/rules';
import { createGitRepo, removeTempDir } from './helpers';

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

describe('architecture rules', () => {
  it('accepts a boundary until a controller imports across it', () => {
    const root = createGitRepo();
    dirs.push(root);
    write(
      root,
      'src/payments/stripe.js',
      `export function charge(id) {
  return id;
}
`,
    );
    write(
      root,
      'src/controllers/pay.js',
      `export function pay(id) {
  return id;
}
`,
    );

    const created = withLepper(root, (store) =>
      addRule(store, {
        from: 'src/controllers',
        to: 'src/payments',
        note: 'Do not call Stripe from controllers.',
      }),
    );
    expect(created.id).toMatch(/^rule-/);
    const clean = withLepper(root, (store) => checkRules(root, store));
    expect(clean.ok).toBe(true);
    expect(clean.broken).toBe(0);

    write(
      root,
      'src/controllers/pay.js',
      `import { charge } from '../payments/stripe';

export function pay(id) {
  return charge(id);
}
`,
    );
    const broken = withLepper(root, (store) => checkRules(root, store));
    expect(broken.ok).toBe(false);
    expect(broken.broken).toBe(1);
    const hits = broken.rules[0]?.violations || [];
    expect(hits.some((hit) => hit.via === 'import')).toBe(true);
    expect(hits.some((hit) => hit.from === 'src/controllers/pay.js')).toBe(
      true,
    );
    expect(hits.some((hit) => hit.to === 'src/payments/stripe.js')).toBe(true);

    const elsewhere = withLepper(root, (store) =>
      checkRules(root, store, 'src/payments'),
    );
    expect(elsewhere.ok).toBe(true);
    const here = withLepper(root, (store) =>
      checkRules(root, store, 'src/controllers'),
    );
    expect(here.ok).toBe(false);
    expect(here.rules[0]?.violations[0]?.from).toBe('src/controllers/pay.js');

    expect(() =>
      withLepper(root, (store) =>
        addRule(store, {
          from: 'src/controllers',
          to: 'src/payments',
        }),
      ),
    ).toThrow(/already exists/);

    withLepper(root, (store) => removeRule(store, created.id));
    expect(withLepper(root, (store) => listRules(store))).toEqual([]);
    expect(withLepper(root, (store) => checkRules(root, store)).ok).toBe(true);
  });

  it('prints a failure from the CLI and the MCP tools', () => {
    const root = createGitRepo();
    dirs.push(root);
    write(
      root,
      'src/payments/stripe.js',
      `export function charge(id) {
  return id;
}
`,
    );
    write(
      root,
      'src/controllers/pay.js',
      `import { charge } from '../payments/stripe';

export function pay(id) {
  return charge(id);
}
`,
    );

    const added = callTool(
      'rule',
      {
        action: 'add',
        from: 'src/controllers',
        to: 'src/payments',
        note: 'Do not call Stripe from controllers.',
      },
      root,
    );
    expect(added.isError).toBeFalsy();
    expect(added.content[0]?.text).toMatch(/rule-/);

    const logs: string[] = [];
    const spy = vi
      .spyOn(console, 'log')
      .mockImplementation((message?: unknown) => {
        logs.push(String(message ?? ''));
      });
    expect(() => checkCommand({ cwd: root })).toThrow(/broken rules/);
    spy.mockRestore();
    expect(logs.join('\n')).toContain('ARCHITECTURE CHECK');
    expect(logs.join('\n')).toContain('src/controllers/pay.js');

    const checked = callTool('check', {}, root);
    expect(checked.isError).toBe(true);
    expect(checked.content[0]?.text).toContain('Do not call Stripe');
  });
});
