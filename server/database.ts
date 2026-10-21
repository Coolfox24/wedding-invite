import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from './errors.ts';
import { validateInvite, validateRsvp } from './validation.ts';
import type { Guest, GuestResponse, InviteInput, RsvpInput } from './validation.ts';

interface InviteRow {
  id: string;
  owner_key: string;
  label: string;
  expires_at: string | null;
  revoked_at: string | null;
  revision: number;
  notes: string;
  submitted_at: string | null;
}

interface GuestRow {
  id: string;
  name: string;
  is_plus_one: number;
  attending: number | null;
  dietary_requirements: string;
  response_name: string | null;
}

export interface CreatedInvite {
  key: string;
  label: string;
  token: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    const version = this.db.prepare('PRAGMA user_version').get()!.user_version;
    if (version === 0) {
      this.db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE invitations (
          id TEXT PRIMARY KEY,
          owner_key TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT,
          revoked_at TEXT,
          revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
          notes TEXT NOT NULL DEFAULT '',
          submitted_at TEXT,
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE guests (
          id TEXT PRIMARY KEY,
          invitation_id TEXT NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          name TEXT NOT NULL,
          is_plus_one INTEGER NOT NULL CHECK(is_plus_one IN (0, 1)),
          attending INTEGER CHECK(attending IN (0, 1)),
          dietary_requirements TEXT NOT NULL DEFAULT '',
          response_name TEXT,
          UNIQUE(invitation_id, position)
        ) STRICT;
        PRAGMA user_version = 1;
        COMMIT;
      `);
    } else if (version !== 1) {
      this.db.close();
      throw new Error('Unsupported database schema version.');
    }
  }

  close() { this.db.close(); }

  private transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = run();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private guestRows(id: string): GuestRow[] {
    return this.db.prepare('SELECT * FROM guests WHERE invitation_id = ? ORDER BY position').all(id) as unknown as GuestRow[];
  }

  guests(id: string): Guest[] {
    return this.guestRows(id).map((guest) => ({ id: guest.id, name: guest.name, isPlusOne: guest.is_plus_one === 1 }));
  }

  authenticate(token: string, now = Date.now()): InviteRow {
    const row = this.db.prepare('SELECT * FROM invitations WHERE token_hash = ?').get(hashToken(token)) as unknown as InviteRow | undefined;
    if (!row || row.revoked_at || (row.expires_at && Date.parse(row.expires_at) <= now)) {
      throw new HttpError(401, 'invalid_invitation', 'This invitation link is invalid or no longer active.');
    }
    return row;
  }

  view(invitation: InviteRow) {
    const rows = this.guestRows(invitation.id);
    return {
      label: invitation.label,
      expiresAt: invitation.expires_at,
      guests: rows.map((guest) => ({ id: guest.id, name: guest.name, isPlusOne: guest.is_plus_one === 1 })),
      rsvp: invitation.submitted_at ? {
        revision: invitation.revision,
        notes: invitation.notes,
        updatedAt: invitation.submitted_at,
        guests: rows.map((guest): GuestResponse => ({
          id: guest.id, attending: guest.attending === 1,
          dietaryRequirements: guest.dietary_requirements, name: guest.response_name,
        })),
      } : null,
      revision: invitation.revision,
    };
  }

  save(token: string, value: unknown, now = Date.now()) {
    return this.transaction(() => {
      // Re-check authorization inside the transaction, including revocation/expiry.
      const invitation = this.authenticate(token, now);
      const input = validateRsvp(value, this.guests(invitation.id));
      if (input.revision !== invitation.revision) {
        // A network retry of the last successful PUT is safe and idempotent.
        if (input.revision === invitation.revision - 1 && this.matches(invitation, input)) return this.view(invitation);
        throw new HttpError(409, 'revision_conflict', 'The RSVP has changed. Reload it before saving again.');
      }
      const updatedAt = new Date(now).toISOString();
      this.db.prepare('UPDATE invitations SET revision = revision + 1, notes = ?, submitted_at = ? WHERE id = ?')
        .run(input.notes, updatedAt, invitation.id);
      const update = this.db.prepare('UPDATE guests SET attending = ?, dietary_requirements = ?, response_name = ? WHERE id = ? AND invitation_id = ?');
      for (const guest of input.guests) update.run(Number(guest.attending), guest.dietaryRequirements, guest.name, guest.id, invitation.id);
      return this.view({ ...invitation, revision: invitation.revision + 1, notes: input.notes, submitted_at: updatedAt });
    });
  }

  private matches(invitation: InviteRow, input: RsvpInput): boolean {
    return invitation.notes === input.notes && JSON.stringify(this.view(invitation).rsvp?.guests) === JSON.stringify(input.guests);
  }

  importInvites(inputs: InviteInput[], publish: (created: CreatedInvite[]) => void = () => {}) {
    const validated = inputs.map(validateInvite);
    if (new Set(validated.map((input) => input.key)).size !== validated.length) throw new Error('Duplicate invitation key.');
    return this.transaction(() => {
      const created: CreatedInvite[] = [];
      for (const input of validated) {
        const existing = this.db.prepare('SELECT * FROM invitations WHERE owner_key = ?').get(input.key) as unknown as InviteRow | undefined;
        if (existing) {
          const guests = this.guests(existing.id).map(({ name, isPlusOne }) => ({ name, isPlusOne }));
          if (existing.label !== input.label || existing.expires_at !== input.expiresAt || JSON.stringify(guests) !== JSON.stringify(input.guests)) {
            throw new Error(`Invitation ${input.key} already exists with different details. Import does not replace existing invitations.`);
          }
          continue;
        }
        const id = randomUUID();
        const token = randomBytes(32).toString('base64url');
        this.db.prepare('INSERT INTO invitations (id, owner_key, label, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(id, input.key, input.label, hashToken(token), input.expiresAt, new Date().toISOString());
        const insert = this.db.prepare('INSERT INTO guests (id, invitation_id, position, name, is_plus_one) VALUES (?, ?, ?, ?, ?)');
        input.guests.forEach((guest, position) => insert.run(randomUUID(), id, position, guest.name, Number(guest.isPlusOne)));
        created.push({ key: input.key, label: input.label, token });
      }
      // Persist the one-time secret links before committing; a write failure rolls back the import.
      publish(created);
      return { created: created.length, skipped: validated.length - created.length };
    });
  }

  rotate(key: string, publish: (created: CreatedInvite[]) => void) {
    this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM invitations WHERE owner_key = ?').get(key) as unknown as InviteRow | undefined;
      if (!row) throw new Error('Invitation key not found.');
      const token = randomBytes(32).toString('base64url');
      this.db.prepare('UPDATE invitations SET token_hash = ?, revoked_at = NULL WHERE id = ?').run(hashToken(token), row.id);
      publish([{ key, label: row.label, token }]);
    });
  }

  revoke(key: string) {
    const result = this.db.prepare('UPDATE invitations SET revoked_at = ? WHERE owner_key = ?').run(new Date().toISOString(), key);
    if (result.changes !== 1) throw new Error('Invitation key not found.');
  }

  exportRows() {
    return this.db.prepare(`
      SELECT i.owner_key, i.label, i.revoked_at, i.expires_at, i.revision, i.notes, i.submitted_at,
        g.name, g.is_plus_one, g.attending, g.dietary_requirements, g.response_name
      FROM invitations i JOIN guests g ON g.invitation_id = i.id ORDER BY i.owner_key, g.position
    `).all();
  }

  backup(path: string) { this.db.prepare('VACUUM INTO ?').run(path); }
}
