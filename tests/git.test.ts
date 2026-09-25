import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { projectCwd, resolveGit } from '../src/utils/git';
import { addWorktree, createGitRepo, removeTempDir } from './helpers';

const dirs: string[] = [];

afterEach(() => {
  delete process.env.LEPPER_ROOT;
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) {
      removeTempDir(dir);
    }
  }
});

describe('resolveGit', () => {
  it('uses the common git dir for a normal checkout', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    const git = resolveGit(cwd);
    expect(fs.realpathSync(git.root)).toBe(fs.realpathSync(cwd));
    expect(fs.realpathSync(git.commonGitDir)).toBe(fs.realpathSync(git.gitDir));
    expect(fs.existsSync(git.commonGitDir)).toBe(true);
  });

  it('points worktrees at the shared common git dir', () => {
    const main = createGitRepo();
    dirs.push(main);
    const worktree = addWorktree(main);
    dirs.push(worktree);

    const mainGit = resolveGit(main);
    const wtGit = resolveGit(worktree);
    expect(fs.realpathSync(wtGit.gitDir)).not.toBe(
      fs.realpathSync(mainGit.gitDir),
    );
    expect(fs.existsSync(path.join(worktree, '.git'))).toBe(true);
    expect(fs.statSync(path.join(worktree, '.git')).isFile()).toBe(true);
    expect(fs.realpathSync(wtGit.commonGitDir)).toBe(
      fs.realpathSync(mainGit.commonGitDir),
    );
  });
});

describe('projectCwd', () => {
  it('prefers an explicit path, then LEPPER_ROOT', () => {
    const cwd = createGitRepo();
    dirs.push(cwd);
    process.env.LEPPER_ROOT = cwd;
    expect(projectCwd()).toBe(path.resolve(cwd));
    expect(projectCwd('/tmp/explicit')).toBe(path.resolve('/tmp/explicit'));
  });
});
