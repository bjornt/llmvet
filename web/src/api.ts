import type { Diff } from './types';

export async function fetchDiff(staged: boolean): Promise<Diff> {
  const res = await fetch(`/api/diff?staged=${staged}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch diff: ${res.statusText}`);
  }
  return res.json();
}

export async function submitReview(
  comments: Array<{ file: string; line: number; side: string; body: string }>,
): Promise<void> {
  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comments }),
  });
  if (!res.ok) {
    throw new Error(`Submit failed: ${res.statusText}`);
  }
}

export async function approveReview(): Promise<void> {
  const res = await fetch('/api/approve', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Approve failed: ${res.statusText}`);
  }
}
