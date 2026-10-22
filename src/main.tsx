import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { captureInvitationSession } from './lib/invitation-session.ts';

const root = createRoot(document.getElementById('root')!);
let invitationRevision = 0;

function openInvitation() {
  let storage: Storage | undefined;
  try { storage = window.sessionStorage; } catch { /* The link also works without browser storage. */ }
  const invitationSession = captureInvitationSession(window.location.href, (url) => window.history.replaceState(window.history.state, '', url), storage);
  root.render(<StrictMode><App key={invitationRevision++} invitationSession={invitationSession} /></StrictMode>);
}

openInvitation();

// Opening another fragment link in this tab must switch guests and revalidate.
// Normal #rsvp/#details navigation should leave the current invite and draft intact.
function checkForNewInvitation() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('invite') || new URLSearchParams(url.hash.slice(1)).has('invite')) openInvitation();
}
window.addEventListener('hashchange', checkForNewInvitation);
window.addEventListener('popstate', checkForNewInvitation);
