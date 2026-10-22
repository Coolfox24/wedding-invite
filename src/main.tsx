import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { captureInvitationSession } from './lib/invitation-session.ts';

let storage: Storage | undefined;
try { storage = window.sessionStorage; } catch { /* The link also works without browser storage. */ }
const invitationSession = captureInvitationSession(window.location.href, (url) => window.history.replaceState(window.history.state, '', url), storage);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App invitationSession={invitationSession} />
  </StrictMode>,
);
