import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { createApp } from './app.ts';
import { readConfig } from './config.ts';
import type { Config } from './config.ts';
import { Store, hashToken } from './database.ts';
import type { CreatedInvite } from './database.ts';
import { csv, invitesFromCsv, parseCsv } from './csv.ts';
import { RateLimiter } from './rate-limit.ts';
import { isoDate } from './validation.ts';
import type { InviteInput } from './validation.ts';

const alex: InviteInput = { key: 'alex', label: 'Alex and guest', expiresAt: null, guests: [
  { name: 'Alex Example', isPlusOne: false }, { name: 'Guest of Alex', isPlusOne: true },
] };
const sam: InviteInput = { key: 'sam', label: 'Sam', expiresAt: null, guests: [{ name: 'Sam Example', isPlusOne: false }] };

function seed(store: Store, invites = [alex, sam]): CreatedInvite[] {
  let created: CreatedInvite[] = [];
  store.importInvites(invites, (value) => { created = value; });
  return created;
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolveListening) => server.listen(0, '127.0.0.1', resolveListening));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function stop(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolveStopped, reject) => server.close((error) => error ? reject(error) : resolveStopped()));
}

function tempDir() { return mkdtempSync(join(tmpdir(), 'wedding-api-test-')); }
function cleanup(path: string) {
  const suffix = relative(resolve(tmpdir()), resolve(path));
  assert.ok(suffix.startsWith('wedding-api-test-') && !suffix.includes('..'));
  rmSync(path, { recursive: true, force: true });
}

function responseBody(store: Store, token: string, revision = 0) {
  return { revision, guests: store.guests(store.authenticate(token).id).map((guest) => ({
    id: guest.id, attending: true, dietaryRequirements: 'Vegetarian',
    ...(guest.isPlusOne ? { name: 'Jamie Example' } : {}),
  })), notes: 'Looking forward to it!' };
}

async function fixture(run: (context: { store: Store; created: CreatedInvite[]; base: string }) => Promise<void>, config: Partial<Config> = {}) {
  const store = new Store(':memory:');
  const created = seed(store);
  const server = createApp(store, { ...readConfig({}), ...config });
  const base = await listen(server);
  try { await run({ store, created, base }); }
  finally { await stop(server); store.close(); }
}

test('health checks and invitation reads expose only the authenticated household', async () => {
  await fixture(async ({ store, created, base }) => {
    assert.equal((await fetch(`${base}/health/live`)).status, 200);
    assert.equal((await fetch(`${base}/health/ready`)).status, 200);
    for (const [path, auth] of [
      ['/api/invitation', undefined], ['/api/invitation', 'Bearer short'],
      ['/api/invitation', `Bearer ${'x'.repeat(43)}`],
      ['/api/invitation?invite=secret', `Bearer ${created[0].token}`],
    ] as const) {
      const response = await fetch(`${base}${path}`, { headers: auth ? { Authorization: auth } : {} });
      assert.equal(response.status, path.includes('?') ? 400 : 401);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const response = await fetch(`${base}/api/invitation`, { headers: { Authorization: `Bearer ${created[0].token}` } });
    const json = await response.json() as ReturnType<Store['view']> & { canRespond: boolean; rsvpClosesAt: string | null };
    assert.equal(json.label, alex.label);
    assert.equal(json.guests.length, 2);
    assert.equal(json.rsvp, null);
    assert.equal(json.revision, 0);
    assert.equal(json.canRespond, true);
    assert.equal(json.rsvpClosesAt, null);
    const raw = JSON.stringify(json);
    assert.ok(!raw.includes('Sam Example') && !raw.includes(created[0].token) && !raw.includes(hashToken(created[0].token)));
    const row = store.db.prepare('SELECT token_hash FROM invitations WHERE owner_key = ?').get('alex')!;
    assert.equal(row.token_hash, hashToken(created[0].token));
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  });
});

test('RSVP updates are persistent, atomic, household scoped, and retry safe', async () => {
  await fixture(async ({ store, created, base }) => {
    const token = created[0].token;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const body = responseBody(store, token);
    const save = () => fetch(`${base}/api/rsvp`, { method: 'PUT', headers, body: JSON.stringify(body) });
    const first = await save();
    assert.equal(first.status, 200);
    const firstJson = await first.json() as ReturnType<Store['view']>;
    assert.equal(firstJson.revision, 1);
    assert.equal(firstJson.rsvp!.guests[1].name, 'Jamie Example');
    assert.equal(firstJson.rsvp!.guests[0].dietaryRequirements, 'Vegetarian');
    assert.deepEqual(await (await save()).json(), firstJson);
    const other = store.view(store.authenticate(created[1].token));
    assert.equal(other.revision, 0);
    assert.equal(other.rsvp, null);
    body.notes = 'Stale update';
    assert.equal((await save()).status, 409);
    assert.equal(store.view(store.authenticate(token)).rsvp!.notes, 'Looking forward to it!');
    body.revision = 1;
    body.guests[0].attending = false;
    assert.equal((await save()).status, 200);
    assert.equal(store.view(store.authenticate(token)).revision, 2);
  });
});

test('invalid and malicious inputs cannot change RSVP records', async () => {
  await fixture(async ({ store, created, base }) => {
    const token = created[0].token;
    const original = responseBody(store, token);
    const otherId = store.guests(store.authenticate(created[1].token).id)[0].id;
    const cases: unknown[] = [
      null, [], {}, { ...original, invitationId: 'sam' }, { ...original, revision: -1 }, { ...original, revision: '0' },
      { ...original, guests: [] }, { ...original, guests: [original.guests[0], original.guests[0]] },
      { ...original, guests: [{ ...original.guests[0], id: otherId }, original.guests[1]] },
      { ...original, guests: [{ ...original.guests[0], attending: 'true' }, original.guests[1]] },
      { ...original, guests: [{ ...original.guests[0], name: 'Impersonator' }, original.guests[1]] },
      { ...original, guests: [original.guests[0], { ...original.guests[1], name: '' }] },
      { ...original, guests: [original.guests[0], { ...original.guests[1], attending: false }] },
      { ...original, guests: [{ ...original.guests[0], dietaryRequirements: 'x'.repeat(501) }, original.guests[1]] },
      { ...original, notes: 'x'.repeat(2001) }, { ...original, notes: 'bad\u0000text' },
    ];
    for (const body of cases) {
      const response = await fetch(`${base}/api/rsvp`, { method: 'PUT', headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      }, body: JSON.stringify(body) });
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(store.view(store.authenticate(token)).revision, 0);
    }
    const body = { ...responseBody(store, token), notes: "Robert'); DROP TABLE invitations;--" };
    const response = await fetch(`${base}/api/rsvp`, { method: 'PUT', headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
    }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    assert.equal(store.view(store.authenticate(token)).rsvp!.notes, body.notes);
    assert.equal(store.authenticate(created[1].token).label, 'Sam');
  });
});

test('HTTP validation, CORS and query/method restrictions', async () => {
  await fixture(async ({ store, created, base }) => {
    const token = created[0].token;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}/api/rsvp`, { method: 'PUT', headers, body: '{' })).status, 400);
    assert.equal((await fetch(`${base}/api/rsvp`, { method: 'PUT', headers, body: 'x'.repeat(17000) })).status, 413);
    assert.equal((await fetch(`${base}/api/rsvp`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await fetch(`${base}/api/rsvp`, { method: 'PUT', headers: { ...headers, 'Content-Encoding': 'gzip' }, body: '{}' })).status, 415);
    assert.equal((await fetch(`${base}/api/rsvp`, { method: 'POST', headers })).status, 405);
    assert.equal((await fetch(`${base}/api/admin`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/api/invitation`, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
    const response = await fetch(`${base}/api/invitation`, { headers: { ...headers, Origin: 'http://localhost:5173' } });
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(response.headers.get('access-control-expose-headers'), 'Retry-After');
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
    const preflight = await fetch(`${base}/api/rsvp`, { method: 'OPTIONS', headers: {
      Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type',
    } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'PUT');
    assert.equal((await fetch(`${base}/api/rsvp`, { method: 'OPTIONS', headers: {
      Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'DELETE',
    } })).status, 403);
    assert.equal(store.view(store.authenticate(token)).revision, 0);
  });
});

test('chunked uploads are size limited without allocating unbounded memory', async () => {
  await fixture(async ({ created, base }) => {
    const status = await new Promise<number | undefined>((resolveStatus, reject) => {
      const req = request(`${base}/api/rsvp`, { method: 'PUT', headers: {
        Authorization: `Bearer ${created[0].token}`, 'Content-Type': 'application/json',
      } }, (res) => { res.resume(); res.on('end', () => resolveStatus(res.statusCode)); });
      req.on('error', reject);
      req.write('x'.repeat(9000));
      req.end('x'.repeat(9000));
    });
    assert.equal(status, 413);
  });
});

test('expired, revoked and rotated tokens are rejected, with no lost existing RSVP', async () => {
  await fixture(async ({ store, created, base }) => {
    const old = created[0].token;
    store.save(old, responseBody(store, old));
    store.revoke('alex');
    assert.equal((await fetch(`${base}/api/invitation`, { headers: { Authorization: `Bearer ${old}` } })).status, 401);
    let rotated = '';
    store.rotate('alex', (links) => { rotated = links[0].token; });
    assert.throws(() => store.authenticate(old));
    assert.equal(store.view(store.authenticate(rotated)).revision, 1);
    const expired = seed(store, [{ ...sam, key: 'expired', expiresAt: '2020-01-01T00:00:00Z' }])[0];
    assert.equal((await fetch(`${base}/api/invitation`, { headers: { Authorization: `Bearer ${expired.token}` } })).status, 401);
  });
});

test('deadline is enforced server-side but existing responses remain readable', async () => {
  await fixture(async ({ store, created, base }) => {
    const headers = { Authorization: `Bearer ${created[0].token}`, 'Content-Type': 'application/json' };
    const read = await fetch(`${base}/api/invitation`, { headers });
    assert.equal((await read.json() as { canRespond: boolean }).canRespond, false);
    const response = await fetch(`${base}/api/rsvp`, { method: 'PUT', headers, body: JSON.stringify(responseBody(store, created[0].token)) });
    assert.equal(response.status, 403);
    assert.equal(store.view(store.authenticate(created[0].token)).revision, 0);
  }, { rsvpClosesAt: '2020-01-01T00:00:00Z' });
});

test('IP and token limits work; forwarded headers are ignored unless explicitly trusted', async () => {
  await fixture(async ({ created, base }) => {
    for (let count = 0; count < 3; count++) {
      const response = await fetch(`${base}/api/invitation`, { headers: {
        Authorization: `Bearer ${created[0].token}`, 'CF-Connecting-IP': `192.0.2.${count + 1}`,
      } });
      assert.equal(response.status, count < 2 ? 200 : 429);
      if (count === 2) assert.ok(Number(response.headers.get('retry-after')) > 0);
    }
  }, { ipLimit: 2 });
  await fixture(async ({ created, base }) => {
    const headers = { Authorization: `Bearer ${created[0].token}`, 'CF-Connecting-IP': '192.0.2.1' };
    assert.equal((await fetch(`${base}/api/invitation`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/api/invitation`, { headers: { ...headers, 'CF-Connecting-IP': '192.0.2.2' } })).status, 429);
    assert.equal((await fetch(`${base}/api/invitation`, { headers: { Authorization: headers.Authorization } })).status, 400);
  }, { tokenLimit: 1, trustCloudflareProxy: true });
  const limiter = new RateLimiter(1, 1000, 1);
  assert.equal(limiter.consume('a', 0), 0);
  assert.ok(limiter.consume('b', 1) > 0);
  assert.ok(limiter.consume('a', 2) > 0);
  assert.equal(limiter.consume('b', 1000), 0);
});

test('database persists across restarts and consistent backups restore complete RSVPs', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'rsvp.sqlite');
    let store = new Store(path);
    const [invite] = seed(store);
    store.save(invite.token, responseBody(store, invite.token));
    store.backup(join(dir, 'backup.sqlite'));
    store.close();
    store = new Store(path);
    assert.equal(store.view(store.authenticate(invite.token)).revision, 1);
    store.close();
    const backup = new Store(join(dir, 'backup.sqlite'));
    assert.equal(backup.view(backup.authenticate(invite.token)).rsvp!.guests[1].name, 'Jamie Example');
    backup.close();
  } finally { cleanup(dir); }
});

test('CSV parsing and imports support quotes, BOMs and Unicode; exports prevent formulas', () => {
  const text = '\uFEFFinvitation_key,invitation_label,guest_name,is_plus_one,expires_at\r\na,"Alex, household","Zoë ""Example""",false,\r\na,"Alex, household",Guest of Zoë,true,\r\n';
  const invites = invitesFromCsv(text);
  assert.equal(invites[0].guests[0].name, 'Zoë "Example"');
  assert.equal(invites[0].guests[1].isPlusOne, true);
  assert.throws(() => parseCsv('"unfinished'));
  assert.throws(() => parseCsv('"closed"unexpected'));
  assert.throws(() => invitesFromCsv(text.replace('false', 'yes')));
  assert.throws(() => invitesFromCsv(text.replace('Guest of Zoë,true,', 'Guest of Zoë,true,2027-01-01T00:00:00Z')));
  assert.equal(parseCsv(csv([['=SUM(1,2)', '+cmd', '@cmd', '-cmd', 'normal\ntext']]))[0][0], "'=SUM(1,2)");
  assert.equal(isoDate('2026-12-11T23:59:59+11:00'), '2026-12-11T12:59:59.000Z');
  assert.throws(() => isoDate('2026-02-30T00:00:00Z'));
  assert.throws(() => readConfig({ ALLOWED_ORIGINS: '*' }));
  assert.throws(() => readConfig({ PORT: '-1' }));
});

test('imports are idempotent, preserve tokens/responses and roll back failures', () => {
  const store = new Store(':memory:');
  try {
    const [invite] = seed(store, [alex]);
    store.save(invite.token, responseBody(store, invite.token));
    assert.deepEqual(store.importInvites([alex]), { created: 0, skipped: 1 });
    assert.equal(store.view(store.authenticate(invite.token)).revision, 1);
    assert.throws(() => store.importInvites([sam, { ...alex, label: 'Changed' }]));
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM invitations').get()!.count, 1);
    assert.throws(() => store.importInvites([sam], () => { throw new Error('Disk full'); }));
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM invitations').get()!.count, 1);
    assert.throws(() => store.rotate('alex', () => { throw new Error('Disk full'); }));
    assert.equal(store.view(store.authenticate(invite.token)).revision, 1);
  } finally { store.close(); }
});

test('private CLI creates secret links without printing them and refuses output overwrites', () => {
  const dir = tempDir();
  const cli = resolve('server/cli.ts');
  const env = { ...process.env, DATABASE_PATH: join(dir, 'rsvp.sqlite'), PUBLIC_BASE_URL: 'https://wedding.example.com/' };
  const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], { env, encoding: 'utf8' });
  try {
    const input = join(dir, 'guests.csv');
    const links = join(dir, 'links.csv');
    writeFileSync(input, 'invitation_key,invitation_label,guest_name,is_plus_one,expires_at\na,Alex,Alex Example,false,\n');
    const imported = run('import', input, '--links', links);
    assert.equal(imported.status, 0, imported.stderr);
    const url = new URL(parseCsv(readFileSync(links, 'utf8'))[1][2]);
    const token = url.searchParams.get('invite')!;
    assert.ok(token.length === 43 && !imported.stdout.includes(token) && !imported.stderr.includes(token));
    assert.equal(run('import', input, '--links', links).status, 1);
    assert.equal(run('rotate', 'a', '--links', join(dir, 'rotated.csv')).status, 0);
    const store = new Store(env.DATABASE_PATH);
    assert.throws(() => store.authenticate(token));
    store.close();
    assert.equal(run('export', join(dir, 'responses.csv')).status, 0);
    assert.equal(run('backup', join(dir, 'backup.sqlite')).status, 0);
    assert.equal(run('revoke', 'a').status, 0);
    const failedEnv = { ...env, PUBLIC_BASE_URL: 'http://insecure.example.com/' };
    assert.equal(spawnSync(process.execPath, ['--experimental-strip-types', cli, 'rotate', 'a', '--links', join(dir, 'bad.csv')], { env: failedEnv }).status, 1);
  } finally { cleanup(dir); }
});

test('optional static hosting serves frontend assets without exposing data or swallowing API errors', async () => {
  const dir = tempDir();
  const store = new Store(':memory:');
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist', 'index.html'), '<h1>Invitation</h1>');
  writeFileSync(join(dir, 'secret.txt'), 'not public');
  const server = createApp(store, readConfig({}), { staticDirectory: join(dir, 'dist') });
  const base = await listen(server);
  try {
    assert.equal((await fetch(base)).status, 200);
    assert.match(await (await fetch(`${base}/invite/abc`)).text(), /Invitation/);
    assert.equal((await fetch(`${base}/missing.js`)).status, 404);
    assert.equal((await fetch(`${base}/%2e%2e%2fsecret.txt`)).status, 404);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    assert.equal((await fetch(`${base}/api/missing`)).status, 404);
    assert.equal((await fetch(base, { method: 'HEAD' })).status, 200);
  } finally { await stop(server); store.close(); cleanup(dir); }
});
