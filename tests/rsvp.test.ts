import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { captureInvitationSession } from '../src/lib/invitation-session.ts';
import { loadInvitation, RsvpError, saveRsvp } from '../src/lib/rsvp-api.ts';
import type { RsvpPayload } from '../src/lib/rsvp-api.ts';
import { createApp } from '../server/app.ts';
import { readConfig } from '../server/config.ts';
import { Store } from '../server/database.ts';
import type { CreatedInvite } from '../server/database.ts';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}

test('fragment invitation is removed from the URL and restored only in the same tab storage', () => {
  const token = 'a'.repeat(43);
  const storage = memoryStorage();
  let cleaned = '';
  const session = captureInvitationSession(`https://invite.sebmg.com/?source=email#invite=${token}`, (url) => { cleaned = url; }, storage);
  assert.deepEqual(session, { status: 'ready', token });
  assert.equal(cleaned, '/?source=email');
  assert.ok(!cleaned.includes(token));
  assert.deepEqual(captureInvitationSession('https://invite.sebmg.com/', () => assert.fail(), storage), session);
  assert.deepEqual(captureInvitationSession('https://invite.sebmg.com/', () => assert.fail(), memoryStorage()), { status: 'missing' });
});

test('legacy query links work and an explicit new/invalid link replaces a previous guest', () => {
  const first = 'a'.repeat(43);
  const second = 'b'.repeat(43);
  const storage = memoryStorage();
  captureInvitationSession(`https://invite.sebmg.com/#invite=${first}`, () => {}, storage);
  let cleaned = '';
  assert.deepEqual(captureInvitationSession(`https://invite.sebmg.com/?invite=${second}&source=email#rsvp`, (url) => { cleaned = url; }, storage), { status: 'ready', token: second });
  assert.equal(cleaned, '/?source=email#rsvp');
  assert.deepEqual(captureInvitationSession('https://invite.sebmg.com/?invite=bad', () => {}, storage), { status: 'invalid' });
  assert.deepEqual(captureInvitationSession('https://invite.sebmg.com/', () => {}, storage), { status: 'missing' });
  for (const suffix of [`?invite=${first}&invite=${second}`, `?invite=${first}#invite=${second}`, '#invite=', '?invite=']) {
    assert.deepEqual(captureInvitationSession(`https://invite.sebmg.com/${suffix}`, () => {}, storage), { status: 'invalid' });
  }
});

test('a fresh fragment works if session storage is disabled', () => {
  const storage = { getItem: () => { throw new Error('Disabled'); }, setItem: () => { throw new Error('Disabled'); }, removeItem: () => { throw new Error('Disabled'); } };
  assert.equal(captureInvitationSession(`https://invite.sebmg.com/#invite=${'a'.repeat(43)}`, () => {}, storage).status, 'ready');
  assert.equal(captureInvitationSession('https://invite.sebmg.com/', () => {}, storage).status, 'missing');
});

test('API client sends credentials only in a bearer header to fixed API paths', async () => {
  const token = 'a'.repeat(43);
  let calls = 0;
  const response = { label: 'Test Guest', guests: [{ id: 'test-id', name: 'Test Guest', isPlusOne: false }], expiresAt: null, rsvp: null, revision: 0, rsvpClosesAt: null, canRespond: true };
  const mock: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, '/api/invitation');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.referrerPolicy, 'no-referrer');
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${token}`);
    assert.equal(init?.body, undefined);
    return new Response(JSON.stringify(response));
  };
  assert.equal((await loadInvitation(token, { fetch: mock })).label, 'Test Guest');
  assert.equal(calls, 1);
});

test('API client handles expired links, conflicts, rate limits and HTML fallbacks without echoing server messages', async () => {
  for (const status of [401, 403, 409, 429, 500]) {
    await assert.rejects(loadInvitation('a'.repeat(43), { fetch: async () => new Response(JSON.stringify({ error: { code: 'untrusted', message: 'SECRET MUST NOT BE DISPLAYED' } }), { status, headers: { 'Retry-After': '45' } }) }), (error: unknown) => {
      assert.ok(error instanceof RsvpError);
      assert.equal(error.status, status);
      assert.ok(!error.message.includes('SECRET'));
      assert.equal(error.retryAfter, status === 429 ? 45 : 0);
      return true;
    });
  }
  for (const value of ['<html>Wrong server</html>', '{}', JSON.stringify({ label: 'Partial object' })]) {
    await assert.rejects(loadInvitation('a'.repeat(43), { fetch: async () => new Response(value) }), (error: unknown) => error instanceof RsvpError && error.status === 502);
  }
  await assert.rejects(loadInvitation('a'.repeat(43), { fetch: async () => { throw new Error('Raw error with credentials'); } }), (error: unknown) => error instanceof RsvpError && error.status === 0 && !error.message.includes('credentials'));
});

async function listen(server: Server) {
  await new Promise<void>((resolveListening) => server.listen(0, '127.0.0.1', resolveListening));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const adapter: typeof fetch = (url, init) => {
    assert.ok(typeof url === 'string' && ['/api/invitation', '/api/rsvp'].includes(url));
    return fetch(new URL(url, base), { ...init, headers: { ...init?.headers, Origin: 'https://invite.sebmg.com' } });
  };
  return adapter;
}

async function stop(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolveStopped, reject) => server.close((error) => error ? reject(error) : resolveStopped()));
}

test('frontend client saves a personal RSVP, prevents impersonation/conflicts, and reloads it after a database restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wedding-rsvp-test-'));
  const path = join(directory, 'rsvp.sqlite');
  const config = readConfig({ ALLOWED_ORIGINS: 'https://invite.sebmg.com' });
  let store = new Store(path);
  let server = createApp(store, config);
  let adapter = await listen(server);
  let created: CreatedInvite[] = [];
  try {
    store.importInvites([
      { key: 'test-guest', label: 'Test Guest', expiresAt: null, guests: [{ name: 'Test Guest', isPlusOne: false }] },
      { key: 'other', label: 'Other Guest', expiresAt: null, guests: [{ name: 'Other Guest', isPlusOne: false }] },
    ], (value) => { created = value; });
    const token = created[0].token;
    const invitation = await loadInvitation(token, { fetch: adapter });
    assert.equal(invitation.guests.length, 1);
    assert.equal(invitation.guests[0].name, 'Test Guest');
    assert.equal(invitation.rsvp, null);
    const other = await loadInvitation(created[1].token, { fetch: adapter });
    const payload: RsvpPayload = { revision: 0, guests: [{ id: invitation.guests[0].id, attending: true, dietaryRequirements: 'Vegetarian' }], notes: 'Frontend to SQLite test' };
    await assert.rejects(saveRsvp(token, { ...payload, guests: [{ ...payload.guests[0], id: other.guests[0].id }] }, { fetch: adapter }), (error: unknown) => error instanceof RsvpError && error.status === 400);
    assert.equal((await loadInvitation(token, { fetch: adapter })).revision, 0);
    const saved = await saveRsvp(token, payload, { fetch: adapter });
    assert.equal(saved.revision, 1);
    assert.equal(saved.rsvp!.notes, payload.notes);
    assert.deepEqual(await saveRsvp(token, payload, { fetch: adapter }), saved);
    await assert.rejects(saveRsvp(token, { ...payload, notes: 'Stale edit' }, { fetch: adapter }), (error: unknown) => error instanceof RsvpError && error.status === 409);
    assert.equal((await loadInvitation(created[1].token, { fetch: adapter })).rsvp, null);
    await stop(server);
    store.close();
    store = new Store(path);
    server = createApp(store, config);
    adapter = await listen(server);
    const restored = await loadInvitation(token, { fetch: adapter });
    assert.equal(restored.rsvp!.notes, payload.notes);
    assert.equal(restored.rsvp!.guests[0].dietaryRequirements, 'Vegetarian');
    store.revoke('test-guest');
    await assert.rejects(loadInvitation(token, { fetch: adapter }), (error: unknown) => error instanceof RsvpError && error.status === 401);
  } finally {
    await stop(server);
    store.close();
    const suffix = relative(resolve(tmpdir()), resolve(directory));
    assert.ok(suffix.startsWith('wedding-rsvp-test-') && !suffix.includes('..'));
    rmSync(directory, { recursive: true, force: true });
  }
});
