import { HttpError } from './errors.ts';

export interface Guest {
  id: string;
  name: string;
  isPlusOne: boolean;
}

export interface GuestResponse {
  id: string;
  attending: boolean;
  dietaryRequirements: string;
  name: string | null;
}

export interface RsvpInput {
  revision: number;
  guests: GuestResponse[];
  notes: string;
}

export interface InviteInput {
  key: string;
  label: string;
  guests: { name: string; isPlusOne: boolean }[];
  expiresAt: string | null;
}

function invalid(message: string): never {
  throw new HttpError(400, 'invalid_input', message);
}

export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid('Expected a JSON object.');
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    invalid('Unexpected field in request.');
  }
}

export function textField(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    invalid(`${label} must be text of at most ${max} characters.`);
  }
  const normalized = value.trim();
  if (required && !normalized) invalid(`${label} is required.`);
  return normalized;
}

export function isoDate(value: string): string {
  // Require an explicit timezone; do not depend on the server's local timezone.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('Dates must be ISO 8601 timestamps with a timezone.');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date.');
  // Date.parse normalizes dates such as 30 February; reject impossible calendar dates.
  const day = Number(value.slice(8, 10));
  const month = Number(value.slice(5, 7));
  const year = Number(value.slice(0, 4));
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) {
    throw new Error('Invalid calendar date.');
  }
  return date.toISOString();
}

export function validateInvite(input: InviteInput): InviteInput {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(input.key)) throw new Error('Invitation keys must use 1–80 letters, numbers, underscores or hyphens.');
  const label = textField(input.label, 'Invitation label', 160, true);
  if (input.guests.length < 1 || input.guests.length > 20) throw new Error('Each invitation needs 1–20 guests.');
  return {
    key: input.key,
    label,
    guests: input.guests.map((guest) => ({ name: textField(guest.name, 'Guest name', 120, true), isPlusOne: guest.isPlusOne })),
    expiresAt: input.expiresAt ? isoDate(input.expiresAt) : null,
  };
}

export function validateRsvp(value: unknown, guests: Guest[]): RsvpInput {
  const body = object(value);
  onlyKeys(body, ['revision', 'guests', 'notes']);
  if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 0) invalid('revision must be a non-negative integer.');
  if (!Array.isArray(body.guests) || body.guests.length !== guests.length) {
    invalid('Include exactly one response for every invited guest.');
  }
  const allowed = new Map(guests.map((guest) => [guest.id, guest]));
  const seen = new Set<string>();
  const responses = body.guests.map((value): GuestResponse => {
    const response = object(value);
    onlyKeys(response, ['id', 'attending', 'dietaryRequirements', 'name']);
    if (typeof response.id !== 'string' || !allowed.has(response.id) || seen.has(response.id)) {
      invalid('Guest does not belong to this invitation, or is duplicated.');
    }
    seen.add(response.id);
    if (typeof response.attending !== 'boolean') invalid('attending must be true or false.');
    const guest = allowed.get(response.id)!;
    let name: string | null = null;
    if (guest.isPlusOne) {
      if (response.attending) name = textField(response.name, 'Plus-one name', 120, true);
      else if (response.name !== undefined && response.name !== null && response.name !== '') {
        invalid('A declined plus-one must not supply a name.');
      }
    } else if (response.name !== undefined) {
      invalid('Named guests cannot be renamed.');
    }
    return {
      id: response.id,
      attending: response.attending,
      dietaryRequirements: textField(response.dietaryRequirements ?? '', 'Dietary requirements', 500),
      name,
    };
  });
  // Stable order makes retries comparable regardless of the browser's array ordering.
  responses.sort((a, b) => guests.findIndex((guest) => guest.id === a.id) - guests.findIndex((guest) => guest.id === b.id));
  return { revision: body.revision as number, guests: responses, notes: textField(body.notes ?? '', 'Notes', 2000) };
}
