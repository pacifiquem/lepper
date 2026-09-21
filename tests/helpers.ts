import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

export function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lepper-'));
}

export function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function mkdirp(cwd: string, relative: string): string {
  const absolute = path.join(cwd, relative);
  fs.mkdirSync(absolute, { recursive: true });
  return absolute;
}

export function git(cwd: string, args: string[]): string {
  const {
    GIT_DIR: _gitDir,
    GIT_INDEX_FILE: _gitIndexFile,
    GIT_WORK_TREE: _gitWorkTree,
    GIT_COMMON_DIR: _gitCommonDir,
    GIT_PREFIX: _gitPrefix,
    ...rest
  } = process.env;
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: rest,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  }
  return (result.stdout || '').trim();
}

export function createGitRepo(): string {
  const cwd = createTempDir();
  git(cwd, ['init']);
  git(cwd, ['config', 'user.email', 'lepper@example.com']);
  git(cwd, ['config', 'user.name', 'Lepper Test']);
  git(cwd, ['commit', '--allow-empty', '-m', 'init']);
  return cwd;
}

export function addWorktree(repo: string): string {
  const wt = createTempDir();
  fs.rmSync(wt, { recursive: true, force: true });
  git(repo, ['worktree', 'add', wt, '-b', `lepper-wt-${Date.now()}`]);
  return wt;
}

export function writeLegacyInfo(
  cwd: string,
  directories: Record<string, string>,
): void {
  const dir = path.join(cwd, '.lepper');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, '_info.json'),
    `${JSON.stringify({ name: 'legacy', directories }, null, 2)}\n`,
  );
}
