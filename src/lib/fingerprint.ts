import { createHash } from 'crypto';
import { SHORT_FINGERPRINT_LENGTH } from './types';

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`;
}

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

export function shortFingerprint(
  value: string,
  length = SHORT_FINGERPRINT_LENGTH,
): string {
  return value.slice(0, length);
}
