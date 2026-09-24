import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CliError } from './errors';

const LOCK_TIMEOUT_MS = 8000;
const LOCK_WAIT_MS = 20;
const EMPTY_LOCK_GRACE_MS = 1000;

function sleep(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      // fallback when Atomics.wait is unavailable
    }
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function ownerPid(token: string): number | null {
  const pid = Number(token.split(':')[0]);
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  return pid;
}

function readToken(lockPath: string): string | null {
  try {
    return fs.readFileSync(lockPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Take a lock whose owner is gone. Rename is the claim: only one waiter
 * moves the file, and a live owner's token is never removed.
 */
function reclaimStale(lockPath: string): void {
  const token = readToken(lockPath);
  if (token === null) {
    return;
  }

  const pid = ownerPid(token);
  if (pid && pidAlive(pid)) {
    return;
  }

  if (!pid) {
    let mtimeMs = Date.now();
    try {
      mtimeMs = fs.statSync(lockPath).mtimeMs;
    } catch {
      return;
    }
    if (Date.now() - mtimeMs < EMPTY_LOCK_GRACE_MS) {
      return;
    }
  }

  const stale = `${lockPath}.stale-${process.pid}-${crypto
    .randomBytes(4)
    .toString('hex')}`;
  try {
    fs.renameSync(lockPath, stale);
  } catch {
    return;
  }

  let drop = false;
  try {
    const moved = fs.readFileSync(stale, 'utf8');
    const movedPid = ownerPid(moved);
    drop = moved === token && !(movedPid && pidAlive(movedPid));
  } catch {
    drop = false;
  }

  if (!drop) {
    try {
      fs.renameSync(stale, lockPath);
    } catch {
      // the path was recreated; leave the side file rather than delete a live lock
    }
    return;
  }

  try {
    fs.unlinkSync(stale);
  } catch {
    // ignore
  }
}

function release(lockPath: string, token: string): void {
  if (readToken(lockPath) !== token) {
    return;
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // ignore
  }
}

export function withStoreLock<T>(storeDir: string, fn: () => T): T {
  fs.mkdirSync(storeDir, { recursive: true });
  const lockPath = path.join(storeDir, 'LOCK');
  const token = `${process.pid}:${crypto.randomBytes(8).toString('hex')}`;
  const started = Date.now();
  let held = false;

  while (!held) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try {
        fs.writeSync(fd, token);
      } finally {
        fs.closeSync(fd);
      }
      held = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw error;
      }

      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new CliError('Timed out waiting for the lepper store lock.');
      }

      reclaimStale(lockPath);
      sleep(LOCK_WAIT_MS);
    }
  }

  try {
    return fn();
  } finally {
    release(lockPath, token);
  }
}
