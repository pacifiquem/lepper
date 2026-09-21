import { describe, expect, it } from 'vitest';
import {
  canonicalize,
  fingerprint,
  shortFingerprint,
} from '../src/lib/fingerprint';

describe('fingerprint', () => {
  it('is stable for key order', () => {
    const a = fingerprint({ path: './src', body: 'cache', parent: null });
    const b = fingerprint({ body: 'cache', parent: null, path: './src' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(shortFingerprint(a)).toHaveLength(12);
  });

  it('changes when the note body changes', () => {
    expect(fingerprint({ path: './src/cache', body: 'ttl 5m' })).not.toBe(
      fingerprint({ path: './src/cache', body: 'ttl 10m' }),
    );
  });

  it('canonicalizes arrays and nested objects', () => {
    expect(canonicalize({ tags: ['b', 'a'], n: 1 })).toBe(
      '{"n":1,"tags":["b","a"]}',
    );
  });
});
