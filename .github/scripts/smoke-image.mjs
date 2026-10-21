import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = 'http://127.0.0.1:3001';
const token = readFileSync('/data/links.csv', 'utf8').match(/[?&]invite=([A-Za-z0-9_-]{43})/)?.[1];
assert.ok(token, 'Private fixture import must generate an invitation link');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const index = await fetch(base);
assert.equal(index.status, 200);
assert.match(index.headers.get('content-type'), /text\/html/);
const html = await index.text();
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"#?]+)"/g)].map((match) => match[1]);
assert.ok(assets.some((asset) => asset.endsWith('.js')), 'Frontend must load its JavaScript from /assets');
assert.ok(assets.some((asset) => asset.endsWith('.css')), 'Frontend must load its CSS from /assets');
assert.ok(!html.includes('/wedding-invite/assets/'), 'Container build must use the root URL');
for (const asset of assets) {
  const response = await fetch(`${base}${asset}`);
  assert.equal(response.status, 200, `Asset must be served: ${asset}`);
  assert.ok(!response.headers.get('content-type').includes('text/html'), 'Missing assets must not return the SPA');
}
assert.equal((await fetch(`${base}/api/invitation`)).status, 401);
assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
const before = await fetch(`${base}/api/invitation`, { headers });
assert.equal(before.status, 200);
const invitation = await before.json();

if (process.env.SMOKE_MODE === 'save') {
  assert.equal(invitation.revision, 0);
  const saved = await fetch(`${base}/api/rsvp`, {
    method: 'PUT', headers,
    body: JSON.stringify({
      revision: 0,
      guests: invitation.guests.map((guest) => ({
        id: guest.id, attending: true, dietaryRequirements: 'Vegetarian',
        ...(guest.isPlusOne ? { name: 'Test Guest' } : {}),
      })),
      notes: 'ARM64 container persistence check',
    }),
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 1);
} else {
  assert.equal(process.env.SMOKE_MODE, 'verify');
  assert.equal(invitation.revision, 1);
  assert.equal(invitation.rsvp.notes, 'ARM64 container persistence check');
  assert.ok(invitation.rsvp.guests.every((guest) => guest.attending && guest.dietaryRequirements === 'Vegetarian'));
}
console.log(`Frontend, API, and database smoke test passed (${process.env.SMOKE_MODE}).`);
