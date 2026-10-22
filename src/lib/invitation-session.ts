export type InvitationSession = { status: 'ready'; token: string } | { status: 'missing' | 'invalid' };

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const storageKey = 'wedding-invitation-token';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function forgetInvitationSession(storage?: Storage) {
  try { storage?.removeItem(storageKey); } catch { /* Memory-only use still works. */ }
}

// Capture each newly opened invitation before rendering. No tokens go in the DOM or localStorage.
export function captureInvitationSession(href: string, replaceUrl: (url: string) => void, storage?: Storage): InvitationSession {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const supplied = [...url.searchParams.getAll('invite'), ...fragment.getAll('invite')];
  const explicit = supplied.length > 0;
  if (explicit) {
    url.searchParams.delete('invite');
    if (fragment.has('invite')) {
      fragment.delete('invite');
      url.hash = fragment.toString();
    }
    replaceUrl(`${url.pathname}${url.search}${url.hash}`);
    // A new/invalid link must never fall back to the previous guest in this tab.
    forgetInvitationSession(storage);
    if (supplied.length !== 1 || !tokenPattern.test(supplied[0])) return { status: 'invalid' };
    try { storage?.setItem(storageKey, supplied[0]); } catch { /* Private browsing can disable storage. */ }
    return { status: 'ready', token: supplied[0] };
  }
  let stored: string | null = null;
  try { stored = storage?.getItem(storageKey) ?? null; } catch { /* The original link can be reopened. */ }
  if (stored && tokenPattern.test(stored)) return { status: 'ready', token: stored };
  return { status: 'missing' };
}
