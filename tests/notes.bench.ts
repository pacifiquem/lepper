import { bench, describe } from 'vitest';
import { fingerprint } from '../src/utils/fingerprint';
import { tokenize } from '../src/utils/text';

const body =
  'Cache API results are in memory, they expire after 5 minutes. Entry point is store.ts';

describe('note fingerprints and search tokens', () => {
  bench('fingerprint a note payload', () => {
    fingerprint({
      path: './src/cache',
      title: 'Cache',
      body,
      tags: ['cache', 'ttl'],
      parent: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      agent: 'agent-a',
      kind: 'note',
    });
  });

  bench('tokenize a natural-language query and note body', () => {
    tokenize('where is caching');
    tokenize(body);
  });
});
