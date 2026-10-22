import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { InvitationSession } from '../lib/invitation-session.ts';
import { loadInvitation, RsvpError, saveRsvp } from '../lib/rsvp-api.ts';
import type { Invitation } from '../lib/rsvp-api.ts';
import './RsvpForm.css';

interface Answer {
  id: string;
  attending: '' | 'yes' | 'no';
  dietaryRequirements: string;
  name: string;
}

function answersFor(invitation: Invitation): Answer[] {
  return invitation.guests.map((guest) => {
    const reply = invitation.rsvp?.guests.find((reply) => reply.id === guest.id);
    return { id: guest.id, attending: reply ? reply.attending ? 'yes' : 'no' : '', dietaryRequirements: reply?.dietaryRequirements ?? '', name: reply?.name ?? '' };
  });
}

function savedDate(value: string) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function RsvpForm({ session }: { session: InvitationSession }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(session.status === 'ready');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inFlight = useRef(false);
  const status = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session.status !== 'ready') return;
    const controller = new AbortController();
    loadInvitation(session.token, { signal: controller.signal }).then((value) => {
      if (controller.signal.aborted) return;
      setInvitation(value);
      setAnswers(answersFor(value));
      setNotes(value.rsvp?.notes ?? '');
      setConflict(false);
      setSaved(false);
      setError('');
      setLoading(false);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof RsvpError) {
        setError(error.message);
        setInactive(error.status === 401);
        setCooldown(error.retryAfter);
      } else setError('Your invitation could not be loaded. Please try again.');
      setLoading(false);
    });
    return () => controller.abort();
  }, [session, loadAttempt]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function reload() {
    setLoading(true);
    setError('');
    setLoadAttempt((attempt) => attempt + 1);
  }

  function edit(id: string, update: Partial<Answer>) {
    setSaved(false);
    setAnswers((current) => current.map((answer) => answer.id === id ? { ...answer, ...update } : answer));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation || session.status !== 'ready' || inFlight.current || conflict || !invitation.canRespond || inactive || cooldown > 0) return;
    if (answers.some((answer) => !answer.attending)) {
      setError('Please choose whether each guest will attend.');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const value = await saveRsvp(session.token, {
        revision: invitation.revision,
        guests: answers.map((answer) => {
          const guest = invitation.guests.find((guest) => guest.id === answer.id)!;
          return {
            id: answer.id, attending: answer.attending === 'yes', dietaryRequirements: answer.dietaryRequirements,
            ...(guest.isPlusOne && answer.attending === 'yes' ? { name: answer.name.trim() } : {}),
          };
        }),
        notes,
      });
      setInvitation(value);
      setAnswers(answersFor(value));
      setNotes(value.rsvp?.notes ?? '');
      setSaved(true);
    } catch (error) {
      if (error instanceof RsvpError) {
        setError(error.message);
        setConflict(error.status === 409);
        setInactive(error.status === 401);
        setCooldown(error.retryAfter);
        if (error.code === 'rsvp_closed') setInvitation((current) => current ? { ...current, canRespond: false } : current);
      } else setError('Your reply could not be saved. Your answers are still here; please try again.');
    } finally {
      inFlight.current = false;
      setSaving(false);
      // Announce the result and keep keyboard users near the feedback.
      window.requestAnimationFrame(() => status.current?.focus());
    }
  }

  if (session.status === 'missing') return (
    <div className="rsvp-notice">
      <p>Please open the personal invitation link we sent you to RSVP.</p>
      <p>If you need your link, <a href="#faq-contact">contact Matt or Sarah</a>.</p>
    </div>
  );
  if (session.status === 'invalid' || inactive) return (
    <div className="rsvp-notice" role="alert">
      <p>This invitation link is invalid or no longer active.</p>
      <p>Please <a href="#faq-contact">ask Matt or Sarah for a new link</a>.</p>
    </div>
  );

  return (
    <div className="rsvp-form-wrap" aria-busy={loading || saving}>
      {loading && <p role="status">Opening your personal invitation…</p>}
      <div ref={status} tabIndex={-1} className={`rsvp-feedback${error ? ' rsvp-feedback-error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">
        {error && <p>{error}</p>}
        {saved && invitation?.rsvp && <p>Your RSVP is saved. Thank you!<br /><small>Saved {savedDate(invitation.rsvp.updatedAt)}. You can update it below.</small></p>}
      </div>
      {!loading && !invitation && !inactive && <button className="rsvp-button" type="button" onClick={reload} disabled={cooldown > 0}>{cooldown > 0 ? `Try again in ${cooldown}s` : 'Try again'}</button>}
      {invitation && (
        <form className="rsvp-form" onSubmit={submit}>
          <p className="rsvp-for">Invitation for <strong>{invitation.label}</strong></p>
          {invitation.rsvp && !saved && <p className="rsvp-saved-note">Your previous reply has been loaded. Last saved {savedDate(invitation.rsvp.updatedAt)}.</p>}
          {!invitation.canRespond && <p role="status">Replies are now closed. Please <a href="#faq-contact">contact Matt or Sarah</a> about any changes.</p>}
          <fieldset disabled={saving || loading || !invitation.canRespond} className="rsvp-fields">
            <legend className="rsvp-sr-only">Your RSVP</legend>
            {invitation.guests.map((guest, index) => {
              const answer = answers.find((answer) => answer.id === guest.id)!;
              return (
                <fieldset className="rsvp-guest" key={guest.id}>
                  <legend>{guest.name}</legend>
                  <p>Will {guest.isPlusOne ? 'your guest' : invitation.guests.length === 1 ? 'you' : guest.name} be joining us?</p>
                  <div className="rsvp-attendance">
                    <label><input type="radio" name={`attending-${index}`} value="yes" required checked={answer.attending === 'yes'} onChange={() => edit(guest.id, { attending: 'yes' })} /> Joyfully accepts</label>
                    <label><input type="radio" name={`attending-${index}`} value="no" required checked={answer.attending === 'no'} onChange={() => edit(guest.id, { attending: 'no' })} /> Regretfully declines</label>
                  </div>
                  {guest.isPlusOne && answer.attending === 'yes' && <label className="rsvp-field">Your guest’s name<input type="text" autoComplete="off" value={answer.name} maxLength={120} required pattern=".*\S.*" onChange={(event) => edit(guest.id, { name: event.target.value })} /></label>}
                  {answer.attending === 'yes' && <label className="rsvp-field">Dietary requirements or allergies <span>(optional)</span><textarea value={answer.dietaryRequirements} maxLength={500} rows={2} placeholder="Let us know what we should cater for" onChange={(event) => edit(guest.id, { dietaryRequirements: event.target.value })} /></label>}
                </fieldset>
              );
            })}
            <label className="rsvp-field rsvp-notes">A note for us <span>(optional)</span><textarea value={notes} maxLength={2000} rows={3} placeholder="Any special requests or a little message" onChange={(event) => { setNotes(event.target.value); setSaved(false); }} /></label>
          </fieldset>
          {conflict && <p className="rsvp-conflict"><button type="button" className="rsvp-button rsvp-button-secondary" onClick={reload} disabled={loading || cooldown > 0}>Load latest reply</button><small>This replaces the edits above with the reply currently saved.</small></p>}
          {invitation.canRespond && <button type="submit" className="rsvp-button" disabled={saving || loading || conflict || cooldown > 0}>{saving ? 'Saving your reply…' : cooldown > 0 ? `Try again in ${cooldown}s` : invitation.rsvp ? 'Update RSVP' : 'Save RSVP'}</button>}
          <p className="rsvp-privacy">This reply is for the guests named on your invitation. Your personal link lets you return to review or update it.</p>
        </form>
      )}
    </div>
  );
}
