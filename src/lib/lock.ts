import fs from 'fs';
import path from 'path';
import { CliError } from './errors';

const LOCK_TIMEOUT_MS = 8000;
const LOCK_WAIT_MS = 20;

function sleep(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // busy wait: lock holds are short
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function withStoreLock<T>(storeDir: string, fn: () => T): T {
  fs.mkdirSync(storeDir, { recursive: true });
  const lockPath = path.join(storeDir, 'LOCK');
  const started = Date.now();

  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw error;
      }

      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new CliError('Timed out waiting for the lepper store lock.');
      }

      try {
        const pid = Number(fs.readFileSync(lockPath, 'utf-8').trim());
        if (pid && !pidAlive(pid)) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        // lock may have been released
      }

      sleep(LOCK_WAIT_MS);
    }
  }

  try {
    return fn();
  } finally {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // ignore
    }
  }
}
