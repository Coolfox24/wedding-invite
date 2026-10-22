import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { InvitationSession } from '../lib/invitation-session.ts';
import { forgetInvitationSession } from '../lib/invitation-session.ts';
import { loadInvitation, RsvpError } from '../lib/rsvp-api.ts';
import type { Invitation } from '../lib/rsvp-api.ts';
import './InvitationGate.css';

type Access = { status: 'loading' | 'unavailable' } | { status: 'ready'; invitation: Invitation } | { status: 'error'; message: string };

export default function InvitationGate({ session, children }: { session: InvitationSession; children: (invitation: Invitation) => ReactNode }) {
  const [access, setAccess] = useState<Access>({ status: session.status === 'ready' ? 'loading' : 'unavailable' });
  const [attempt, setAttempt] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (session.status !== 'ready') return;
    const controller = new AbortController();
    loadInvitation(session.token, { signal: controller.signal }).then((invitation) => {
      if (!controller.signal.aborted) setAccess({ status: 'ready', invitation });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof RsvpError && error.status === 401) {
        try { forgetInvitationSession(window.sessionStorage); } catch { /* Storage may be disabled. */ }
        setAccess({ status: 'unavailable' });
      } else {
        setCooldown(error instanceof RsvpError ? error.retryAfter : 0);
        setAccess({ status: 'error', message: error instanceof RsvpError && error.retryAfter
          ? `Please wait ${error.retryAfter} seconds before trying again.`
          : 'We couldn’t check your invitation just now. Please try again, or contact Matt or Sarah for help.' });
      }
    });
    return () => controller.abort();
  }, [session, attempt]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (access.status === 'ready') return children(access.invitation);

  return (
    <main className="invitation-page invitation-access-page">
      <section className="invitation-access-panel" aria-labelledby="invitation-access-title" aria-busy={access.status === 'loading'}>
        <span className="invitation-access-flourish" aria-hidden="true">❦</span>
        <p className="invitation-access-names">Matt &amp; Sarah</p>
        <h1 id="invitation-access-title">A Personal Invitation</h1>
        {access.status === 'loading' ? <p role="status">Checking your invitation…</p> : (
          <>
            <p role={access.status === 'error' ? 'alert' : undefined}>{access.status === 'error'
              ? access.message
              : 'We couldn’t open your invitation. Please contact Matt or Sarah for more information or a new personal link.'}</p>
            {access.status === 'error' && <button type="button" className="invitation-access-retry" disabled={cooldown > 0} onClick={() => {
              setAccess({ status: 'loading' });
              setAttempt((value) => value + 1);
            }}>{cooldown > 0 ? `Try again in ${cooldown}s` : 'Try again'}</button>}
          </>
        )}
      </section>
    </main>
  );
}
