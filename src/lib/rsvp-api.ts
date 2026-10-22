export interface InvitedGuest {
  id: string;
  name: string;
  isPlusOne: boolean;
}

export interface GuestReply {
  id: string;
  attending: boolean;
  dietaryRequirements: string;
  name?: string | null;
}

export interface RsvpPayload {
  revision: number;
  guests: GuestReply[];
  notes: string;
}

export interface Invitation {
  label: string;
  expiresAt: string | null;
  guests: InvitedGuest[];
  rsvp: (RsvpPayload & { updatedAt: string }) | null;
  revision: number;
  rsvpClosesAt: string | null;
  canRespond: boolean;
}

export class RsvpError extends Error {
  readonly status: number;
  readonly retryAfter: number;
  readonly code: string;

  constructor(status: number, message: string, retryAfter = 0, code = '') {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.code = code;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseInvitation(value: unknown): Invitation {
  const fail = () => { throw new RsvpError(502, 'The RSVP service returned an unexpected response. Please try again later.'); };
  if (!record(value) || typeof value.label !== 'string' || typeof value.canRespond !== 'boolean' ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      !Array.isArray(value.guests) || value.guests.length < 1 || value.guests.length > 20) return fail();
  const ids = new Set<string>();
  for (const guest of value.guests) {
    if (!record(guest) || typeof guest.id !== 'string' || typeof guest.name !== 'string' || typeof guest.isPlusOne !== 'boolean' || ids.has(guest.id)) return fail();
    ids.add(guest.id);
  }
  for (const date of [value.expiresAt, value.rsvpClosesAt]) {
    if (date !== null && (typeof date !== 'string' || !Number.isFinite(Date.parse(date)))) return fail();
  }
  if (value.rsvp !== null) {
    const reply = value.rsvp;
    if (!record(reply) || reply.revision !== value.revision || typeof reply.notes !== 'string' ||
        typeof reply.updatedAt !== 'string' || !Number.isFinite(Date.parse(reply.updatedAt)) ||
        !Array.isArray(reply.guests) || reply.guests.length !== ids.size) return fail();
    const answered = new Set<string>();
    for (const guest of reply.guests) {
      if (!record(guest) || typeof guest.id !== 'string' || !ids.has(guest.id) || answered.has(guest.id) ||
          typeof guest.attending !== 'boolean' || typeof guest.dietaryRequirements !== 'string' ||
          (guest.name !== null && typeof guest.name !== 'string')) return fail();
      answered.add(guest.id);
    }
  }
  return value as unknown as Invitation;
}

async function request(token: string, method: 'GET' | 'PUT', body: RsvpPayload | undefined, options: RequestOptions): Promise<Invitation> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 15000);
  try {
    const response = await (options.fetch ?? fetch)(method === 'GET' ? '/api/invitation' : '/api/rsvp', {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
    });
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new RsvpError(502, 'The RSVP service is unavailable. Please try again later.'); }
    if (!response.ok) {
      const code = record(value) && record(value.error) ? value.error.code : null;
      let message = 'We couldn’t complete your request. Your answers are still on this page. Please try again.';
      if (response.status === 401) message = 'This invitation link is no longer active. Please ask Matt or Sarah for a new link.';
      else if (response.status === 409) message = 'This RSVP was updated elsewhere. Your edits are still here. Load the latest reply before saving again.';
      else if (response.status === 403) message = code === 'rsvp_closed'
        ? 'The RSVP deadline has passed. Please contact Matt or Sarah about changes.'
        : 'The RSVP service is not accepting replies from this page. Please contact Matt or Sarah.';
      else if (response.status === 400) message = 'Please check that every guest has an attendance choice and that attending plus-ones have a name.';
      else if (response.status === 413) message = 'Your reply is too long. Please shorten the notes or dietary details and try again.';
      const retryAfter = response.status === 429 ? Math.min(300, Math.max(1, Number(response.headers.get('Retry-After')) || 60)) : 0;
      if (retryAfter) message = `Please wait ${retryAfter} seconds before trying again. Your answers are still on this page.`;
      throw new RsvpError(response.status, message, retryAfter, typeof code === 'string' ? code : '');
    }
    return parseInvitation(value);
  } catch (error) {
    if (error instanceof RsvpError) throw error;
    throw new RsvpError(0, 'We couldn’t reach the RSVP service. Your answers are still on this page. Please try again.');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

export function loadInvitation(token: string, options: RequestOptions = {}) {
  return request(token, 'GET', undefined, options);
}

export function saveRsvp(token: string, body: RsvpPayload, options: RequestOptions = {}) {
  return request(token, 'PUT', body, options);
}
