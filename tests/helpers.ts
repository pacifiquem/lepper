import fs from 'fs';
import os from 'os';
import path from 'path';
import { LepperInfo } from '../src/lib/info';

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

export function writeInfoFile(
  cwd: string,
  info: Partial<LepperInfo> | Record<string, unknown>,
  raw?: string,
): string {
  const dir = path.join(cwd, '.lepper');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, '_info.json');
  fs.writeFileSync(
    file,
    raw !== undefined ? raw : `${JSON.stringify(info, null, 2)}\n`,
    'utf-8',
  );
  return file;
}

export function readRawInfo(cwd: string): string {
  return fs.readFileSync(path.join(cwd, '.lepper', '_info.json'), 'utf-8');
}

export function fileExists(cwd: string, relative: string): boolean {
  return fs.existsSync(path.join(cwd, relative));
}
