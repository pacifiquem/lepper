import { afterEach, describe, expect, it } from 'vitest';
import diaryCommand from '../src/diary/cli';
import { mergeDiary, recallDiary, writeDiaryEntry } from '../src/diary/diary';
import { withLepper } from '../src/notes/session';
import { readDiary } from '../src/utils/store';
import { callTool } from '../src/mcp';
import { createGitRepo, removeTempDir } from './helpers';
import { vi } from 'vitest';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

function repo(): string {
  const cwd = createGitRepo();
  dirs.push(cwd);
  return cwd;
}

describe('session diary', () => {
  it('remembers what to keep and what to stop, with the newer line winning', () => {
    const cwd = repo();
    withLepper(cwd, (store) => {
      writeDiaryEntry(store, {
        work: 'First layout of the code map',
        wentWell: ['One folder per language'],
        wentWrong: ['Two keyword folders'],
        agent: 'claude',
      });
      const second = writeDiaryEntry(store, {
        work: 'Moved parsers under languages',
        wentWell: ['Two keyword folders'],
        wentWrong: ['Leaving diary only in a local file'],
        agent: 'grok',
      });
      expect(second.id.startsWith('diary-')).toBe(true);

      const brief = recallDiary(store);
      expect(brief.keep).toEqual([
        'Two keyword folders',
        'One folder per language',
      ]);
      expect(brief.stop).toEqual(['Leaving diary only in a local file']);
      expect(brief.recent.map((entry) => entry.work)[0]).toBe(
        'Moved parsers under languages',
      );
    });
  });

  it('merges entries from two clones by id', () => {
    const cwd = repo();
    const other = repo();
    const local = withLepper(cwd, (store) => {
      writeDiaryEntry(store, {
        work: 'Local session',
        wentWell: ['Short notes'],
        wentWrong: ['Rewriting unrelated docs'],
      });
      return readDiary(store);
    });
    const incoming = withLepper(other, (store) => {
      writeDiaryEntry(store, {
        work: 'Other agent session',
        wentWell: ['Reading the diary first'],
        wentWrong: ['Skipping blast radius'],
        agent: 'codex',
      });
      return readDiary(store);
    });

    const merged = mergeDiary(local, incoming);
    expect(Object.keys(merged.entries)).toHaveLength(2);
    expect(
      Object.values(merged.entries)
        .map((entry) => entry.work)
        .sort(),
    ).toEqual(['Local session', 'Other agent session']);
  });

  it('rejects an entry that has no retrospective', () => {
    const cwd = repo();
    expect(() =>
      withLepper(cwd, (store) =>
        writeDiaryEntry(store, { work: 'Did something' }),
      ),
    ).toThrow(/went well or went wrong/);
  });

  it('prints the brief from the CLI and the MCP tool', () => {
    const cwd = repo();
    withLepper(cwd, (store) =>
      writeDiaryEntry(store, {
        work: 'Added the session diary',
        wentWell: ['Shared across agents'],
        wentWrong: ['Keeping preferences only in the chat'],
      }),
    );

    const logs: string[] = [];
    const spy = vi
      .spyOn(console, 'log')
      .mockImplementation((message?: unknown) => {
        logs.push(String(message ?? ''));
      });
    diaryCommand({ cwd, action: 'recall' });
    spy.mockRestore();
    expect(logs.join('\n')).toMatch(/Keep doing/);
    expect(logs.join('\n')).toMatch(/Shared across agents/);
    expect(logs.join('\n')).toMatch(/Keeping preferences only in the chat/);

    const recalled = callTool('diary', { action: 'recall' }, cwd);
    expect(recalled.isError).toBeFalsy();
    expect(recalled.content[0]?.text).toMatch(/Stop doing/);

    const missing = callTool(
      'diary',
      { action: 'write', work: 'Only work' },
      cwd,
    );
    expect(missing.isError).toBe(true);
  });
});
