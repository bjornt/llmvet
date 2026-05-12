import type { Diff } from './types';

export async function fetchDiff(staged: boolean): Promise<Diff> {
  const res = await fetch(`/api/diff?staged=${staged}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch diff: ${res.statusText}`);
  }
  return res.json();
}
