import type { SessionDetails } from './types';

export async function fetchSessionDetails(
  apiUrl: string,
  sessionId: string,
): Promise<SessionDetails | null> {
  const res = await fetch(`${apiUrl}/api/session/${sessionId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch session (HTTP ${res.status})`);
  return (await res.json()) as SessionDetails;
}

export async function deleteSession(apiUrl: string, sessionId: string): Promise<void> {
  await fetch(`${apiUrl}/api/session/${sessionId}`, { method: 'DELETE' });
}

export async function checkHealth(apiUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
