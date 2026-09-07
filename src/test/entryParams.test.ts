import { describe, it, expect } from 'vitest';
import { readEntryParams } from '@/lib/entryParams';

describe('readEntryParams', () => {
  it('reads rid from the regular query string', () => {
    expect(readEntryParams({ search: '?rid=R_1abc', hash: '#/' })).toEqual({ externalId: 'R_1abc' });
  });

  it('reads rid and force from the hash query (HashRouter form)', () => {
    expect(readEntryParams({ search: '', hash: '#/?rid=R_2def&force=3,1' })).toEqual({
      externalId: 'R_2def',
      force: { agentConditionId: 3, contextId: 1 },
    });
  });

  it('lets the hash query win when both are present', () => {
    expect(readEntryParams({ search: '?rid=old', hash: '#/?rid=new' })).toEqual({ externalId: 'new' });
  });

  it('ignores malformed or out-of-range force values', () => {
    expect(readEntryParams({ search: '?force=5,1', hash: '' })).toEqual({});
    expect(readEntryParams({ search: '?force=1,4', hash: '' })).toEqual({});
    expect(readEntryParams({ search: '?force=abc', hash: '' })).toEqual({});
    expect(readEntryParams({ search: '?force=1', hash: '' })).toEqual({});
  });

  it('returns an empty object when nothing is present', () => {
    expect(readEntryParams({ search: '', hash: '' })).toEqual({});
  });

  it('truncates rid to 100 characters', () => {
    const long = 'x'.repeat(150);
    expect(readEntryParams({ search: `?rid=${long}`, hash: '' }).externalId).toHaveLength(100);
  });
});
