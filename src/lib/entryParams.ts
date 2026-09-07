import type { ForcedAssignment } from '@/types';

export interface EntryParams {
  /** Qualtrics ResponseID (or any external id) passed as `rid`. */
  externalId?: string;
  /** Dev/pilot-only forced cell, passed as `force=<agent>,<context>`. */
  force?: ForcedAssignment;
}

/**
 * Reads the entry parameters from the current URL. With HashRouter the query
 * may live either before the hash (`/?rid=X#/`) or inside it (`/#/?rid=X`);
 * both are accepted, hash query winning when both are present.
 */
export function readEntryParams(loc: { search: string; hash: string } = window.location): EntryParams {
  const merged = new URLSearchParams(loc.search || '');
  const hashQueryIndex = (loc.hash || '').indexOf('?');
  if (hashQueryIndex >= 0) {
    const hashParams = new URLSearchParams(loc.hash.slice(hashQueryIndex + 1));
    hashParams.forEach((value, key) => merged.set(key, value));
  }

  const params: EntryParams = {};

  const rid = merged.get('rid')?.trim();
  if (rid) params.externalId = rid.slice(0, 100);

  const force = parseForce(merged.get('force'));
  if (force) params.force = force;

  return params;
}

function parseForce(raw: string | null): ForcedAssignment | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((p) => parseInt(p.trim(), 10));
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return undefined;
  const [agentConditionId, contextId] = parts;
  if (agentConditionId < 1 || agentConditionId > 4 || contextId < 1 || contextId > 3) return undefined;
  return { agentConditionId, contextId };
}
