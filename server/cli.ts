import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Store } from './database.ts';
import type { CreatedInvite } from './database.ts';
import { csv, invitesFromCsv } from './csv.ts';

const usage = `Private wedding administration (never exposed over HTTP):
  import <guests.csv> --links <new-links.csv>
  create-test --links <new-links.csv>
  rotate <invitation-key> --links <new-links.csv>
  revoke <invitation-key>
  export <new-responses.csv>
  backup <new-backup.sqlite>

Set DATABASE_PATH and PUBLIC_BASE_URL in the environment.
Output files must be new paths. Invitation links are secrets; keep them private.`;

function publicBaseUrl(): URL {
  const value = process.env.PUBLIC_BASE_URL;
  if (!value) throw new Error('PUBLIC_BASE_URL is required when generating links.');
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) throw new Error('PUBLIC_BASE_URL must be an HTTP(S) URL without credentials, query or fragment.');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Public invitation links must use HTTPS.');
  return url;
}

function newFile(path: string, write: (fd: number) => void) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const fd = openSync(path, 'wx', 0o600);
  try { write(fd); fsyncSync(fd); }
  catch (error) { closeSync(fd); unlinkSync(path); throw error; }
  closeSync(fd);
}

function linksWriter(fd: number, base: URL) {
  return (created: CreatedInvite[]) => {
    writeFileSync(fd, csv([
      ['invitation_key', 'invitation_label', 'url'],
      ...created.map((invite) => {
        const url = new URL(base);
        // Fragments are read by the frontend and are never sent in HTTP requests.
        url.hash = new URLSearchParams({ invite: invite.token }).toString();
        return [invite.key, invite.label, url.href];
      }),
    ]));
    // Flush one-time secrets before SQLite commits their hashes.
    fsyncSync(fd);
  };
}

export function runAdmin(args: string[]) {
  if (args.length === 0 || args[0] === '--help') { console.log(usage); return; }
  const [command, input, flag] = args;
  const isTest = command === 'create-test';
  const output = isTest ? args[2] : args[3];
  const createsLinks = command === 'import' || command === 'rotate' || isTest;
  const validArgs = isTest ? args.length === 3 && input === '--links' && !!output
    : createsLinks ? args.length === 4 && flag === '--links' && !!output : args.length === 2;
  if (!input || !validArgs || !['import', 'create-test', 'rotate', 'revoke', 'export', 'backup'].includes(command)) {
    throw new Error(usage);
  }
  process.umask(0o077);
  const store = new Store(resolve(process.env.DATABASE_PATH ?? './data/rsvp.sqlite'));
  try {
    if (createsLinks) {
      const base = publicBaseUrl();
      const path = resolve(output);
      newFile(path, (fd) => {
        if (isTest) {
          store.importInvites([{ key: 'test-guest', label: 'Test Guest', expiresAt: null, guests: [{ name: 'Test Guest', isPlusOne: false }] }], (created) => {
            if (created.length !== 1) throw new Error('Test Guest already exists. Use rotate test-guest --links <new-file> to replace its link.');
            linksWriter(fd, base)(created);
          });
          console.log('Created one Test Guest invitation. Keep its generated link private; revoke test-guest when finished.');
        } else if (command === 'import') {
          const source = readFileSync(resolve(input));
          if (source.length > 1024 * 1024) throw new Error('Guest CSV exceeds 1 MiB.');
          const result = store.importInvites(invitesFromCsv(source.toString('utf8')), linksWriter(fd, base));
          console.log(`Created ${result.created} invitations; skipped ${result.skipped} unchanged invitations.`);
        } else {
          store.rotate(input, linksWriter(fd, base));
          console.log('Invitation link replaced. The old link is inactive.');
        }
      });
    } else if (command === 'revoke') {
      store.revoke(input);
      console.log('Invitation link revoked.');
    } else if (command === 'export') {
      const rows = store.exportRows();
      const headers = ['owner_key', 'label', 'revoked_at', 'expires_at', 'revision', 'notes', 'submitted_at', 'name', 'is_plus_one', 'attending', 'dietary_requirements', 'response_name'];
      newFile(resolve(input), (fd) => writeFileSync(fd, csv([headers, ...rows.map((row) => headers.map((header) => row[header]))])));
      console.log('Responses exported.');
    } else if (command === 'backup') {
      const path = resolve(input);
      if (existsSync(path)) throw new Error('Backup destination already exists.');
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      store.backup(path);
      console.log('Consistent SQLite backup created.');
    }
  } finally { store.close(); }
}

// This file is an executable entry point; errors never print token-bearing data.
try { runAdmin(process.argv.slice(2)); }
catch (error) {
  console.error(error instanceof Error ? error.message : 'Administration command failed.');
  process.exitCode = 1;
}
