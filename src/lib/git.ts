import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CliError } from './errors';

function gitProcessEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const {
    GIT_DIR: _gitDir,
    GIT_INDEX_FILE: _gitIndexFile,
    GIT_WORK_TREE: _gitWorkTree,
    GIT_COMMON_DIR: _gitCommonDir,
    GIT_PREFIX: _gitPrefix,
    ...rest
  } = process.env;
  return { ...rest, ...extra };
}

export function git(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: gitProcessEnv(env),
  });

  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    status: result.status ?? 1,
  };
}

export function gitOk(
  cwd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): string {
  const result = git(cwd, args, env);
  if (result.status !== 0) {
    throw new CliError(result.stderr || `git ${args.join(' ')} failed.`);
  }
  return result.stdout;
}

export interface GitContext {
  root: string;
  gitDir: string;
  commonGitDir: string;
}

export function projectCwd(explicit?: string): string {
  if (explicit && explicit.trim()) {
    return path.resolve(explicit.trim());
  }
  if (process.env.LEPPER_ROOT && process.env.LEPPER_ROOT.trim()) {
    return path.resolve(process.env.LEPPER_ROOT.trim());
  }
  return process.cwd();
}

function resolveGitPath(cwd: string, spec: string): string | null {
  const absolute = git(cwd, ['rev-parse', '--path-format=absolute', spec]);
  if (absolute.status === 0 && absolute.stdout) {
    return path.normalize(absolute.stdout);
  }

  const fallbackSpec = spec === '--git-dir' ? '--absolute-git-dir' : spec;
  const raw = git(cwd, ['rev-parse', fallbackSpec]);
  if (raw.status !== 0 || !raw.stdout) {
    return null;
  }

  return path.normalize(
    path.isAbsolute(raw.stdout) ? raw.stdout : path.resolve(cwd, raw.stdout),
  );
}

export function resolveGit(cwd: string = process.cwd()): GitContext {
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  if (root.status !== 0) {
    throw new CliError(
      'Lepper stores notes inside .git. Run this from a git repository.',
    );
  }

  const gitDir =
    resolveGitPath(cwd, '--git-dir') ||
    resolveGitPath(cwd, '--absolute-git-dir');
  if (!gitDir) {
    throw new CliError(
      'Lepper stores notes inside .git. Run this from a git repository.',
    );
  }

  let commonGitDir = resolveGitPath(cwd, '--git-common-dir') || gitDir;
  if (!path.isAbsolute(commonGitDir)) {
    commonGitDir = path.resolve(cwd, commonGitDir);
  }
  if (!fs.existsSync(commonGitDir)) {
    const fromGitDir = path.resolve(gitDir, commonGitDir);
    commonGitDir = fs.existsSync(fromGitDir) ? fromGitDir : gitDir;
  }

  return {
    root: fs.realpathSync(root.stdout),
    gitDir: fs.realpathSync(gitDir),
    commonGitDir: fs.realpathSync(commonGitDir),
  };
}

export function hasRemote(cwd: string, name = 'origin'): boolean {
  const result = git(cwd, ['remote', 'get-url', name]);
  return result.status === 0 && result.stdout.length > 0;
}
