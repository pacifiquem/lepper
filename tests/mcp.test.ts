import { afterEach, describe, expect, it } from 'vitest';
import { callTool } from '../src/mcp/server';
import { createGitRepo, mkdirp, removeTempDir } from './helpers';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

describe('MCP tools', () => {
  it('records, maps, finds, and tracks todos from the tool surface', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    mkdirp(cwd, 'src/cache');

    const recorded = callTool(
      'record',
      {
        path: 'src/cache',
        note: 'Cache API results are in memory and expire after 5 minutes. Entry point is store.ts',
        agent: 'agent-a',
      },
      cwd,
    );
    expect(recorded.isError).toBeFalsy();
    expect(recorded.content[0]?.text).toMatch(/fingerprint/);

    const found = callTool('find', { query: 'where is caching' }, cwd);
    expect(found.content[0]?.text).toMatch(/store\.ts/);

    const mapped = callTool('map', { path: 'src/cache' }, cwd);
    expect(mapped.content[0]?.text).toMatch(/src\/cache/);

    const added = callTool(
      'todo',
      {
        action: 'add',
        title: 'Explain eviction',
      },
      cwd,
    );
    const addedJson = JSON.parse(added.content[0]?.text || '{}') as {
      id?: string;
    };
    expect(addedJson.id).toMatch(/^todo-/);

    const listed = callTool('todo', { action: 'list' }, cwd);
    expect(listed.content[0]?.text).toMatch(/Explain eviction/);

    const synced = callTool('sync', {}, cwd);
    expect(synced.isError).toBeFalsy();
    expect(synced.content[0]?.text).toMatch(/"pushed": false/);
  });
});
