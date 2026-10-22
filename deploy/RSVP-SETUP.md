# Enable RSVPs at invite.sebmg.com

The frontend loads each invitation's permitted guests and saves their replies
through the same-origin API into SQLite. Nothing is automatically seeded in the
public container. Create one test guest privately using these host commands.

## Deploy the updated image

Commit/merge the RSVP changes into `main`, let **Build ARM64 wedding image** finish,
then pull and redeploy `ghcr.io/coolfox24/wedding-invite:latest` on your Docker host.
Keep the **same existing persistent volume** mounted at `/data` when replacing the
container. Do not delete or initialize a new volume over existing replies.

Set these container environment variables in your deployment configuration:

```dotenv
ALLOWED_ORIGINS=https://invite.sebmg.com
PUBLIC_BASE_URL=https://invite.sebmg.com/
DATABASE_PATH=/data/rsvp.sqlite
```

If using this repository's Compose file, set `WEDDING_ORIGIN=https://invite.sebmg.com`
in `.env`, then run:

```sh
docker compose pull
docker compose up -d
```

The origin has **no trailing slash**; the frontend base URL includes `/`. Saving
in the browser checks the exact allowed origin. Keep the API on the same HTTPS
hostname as the frontend. `TRUST_CLOUDFLARE_PROXY` should stay false unless callers
cannot bypass the tunnel and forge client IP headers. With it disabled, guests
behind the proxy share the IP limit; the invitation limit still applies separately.

## Create one Test Guest

Run these on the Docker host. Use the actual container name from `docker ps`:

```sh
docker ps --format 'table {{.Names}}\t{{.Image}}'
CONTAINER='YOUR-CONTAINER-NAME'

docker exec -e PUBLIC_BASE_URL=https://invite.sebmg.com/ "$CONTAINER" \
  node /app/dist-server/cli.js create-test --links /data/private/test-guest-link.csv

docker exec "$CONTAINER" cat /data/private/test-guest-link.csv
```

The last command shows a private URL like `https://invite.sebmg.com/#invite=...`.
Open that **generated** URL (do not type the ellipsis). It grants access only to
**Test Guest**, with one named attendee and no plus-one. Keep the link file private;
do not commit it, paste it into an issue, or share it publicly. There is no fixed
demo token in the source or image. The key `test-guest` is an owner identifier and
is not accepted as public authorization.

The command refuses to overwrite its output or silently replace an existing Test
Guest. If Test Guest already exists and its original link is lost, replace the
link while preserving replies:

```sh
docker exec -e PUBLIC_BASE_URL=https://invite.sebmg.com/ "$CONTAINER" \
  node /app/dist-server/cli.js rotate test-guest --links /data/private/test-guest-link-replacement.csv
docker exec "$CONTAINER" cat /data/private/test-guest-link-replacement.csv
```

Use a fresh output filename for each rotation. The old link is invalid immediately.

## Verify saving

1. Open the generated link, open the envelope, and go to RSVP. It should say
   **Invitation for Test Guest**. The token disappears from the address bar.
2. Choose acceptance or decline, optionally enter dietary requirements and notes,
   and select **Save RSVP**. Wait for **Your RSVP is saved. Thank you!**
3. Reload and reopen the envelope, or reopen the original generated link. The
   saved choices should load from SQLite. Change them and select **Update RSVP**
   to check updates.
4. Open the bare site in a separate private browser session. It should ask for a
   personal invitation link, not show an editable public guest form.

To inspect stored data directly, make a private CSV export:

```sh
docker exec "$CONTAINER" node /app/dist-server/cli.js export /data/private/rsvp-check.csv
docker cp "$CONTAINER":/data/private/rsvp-check.csv ./rsvp-check.csv
```

Use a fresh filename if the export exists. The CSV includes all invitations, so
keep it private as real guests are added. Do not delete the database to reset a
test. Revoke the test link when finished:

```sh
docker exec "$CONTAINER" node /app/dist-server/cli.js revoke test-guest
```

Revocation leaves its response in the owner export but blocks reads and writes
using that link. Rotating a revoked invitation reactivates it.

## Security behavior

- Each link contains a random 256-bit token; only its hash is stored in SQLite.
  New links use a URL fragment, keeping the secret out of the initial HTTP request
  and access logs. Legacy `?invite=` links still work.
- The frontend removes the secret from the visible URL before rendering. It uses
  memory and this tab's session storage for reloads, not local storage. With
  storage disabled, reopen the original link after refreshing.
- The frontend sends tokens only in bearer headers to fixed same-origin API
  endpoints, without cookies, redirects, referrers, or cached RSVP responses. No
  tokens or guest list are embedded in the public bundle. A forwarded link still
  grants that invitation's access until revoked or replaced.
- The server derives ownership from the token and requires exactly the permitted
  guests. Named guests cannot be renamed. IDs, attendance, input limits, and
  plus-one names are validated before any database write.
- Saving requires an explicit button press. Revision checks prevent older forms
  overwriting newer answers. Network errors retain edits on screen; success is
  shown only after SQLite commits the reply.
- Rate limits, revocation, optional expiry/deadline, request size limits,
  parameterized SQL, and private administration remain enforced. There is no
  public signup, guest-list export, or administration endpoint.
- Retain Cloudflare HTTPS, bypass caching for `/api/*`, update the host/container,
  and back up the persistent SQLite database with the private backup command.

Deployment and live test-guest creation happen when you run these host commands;
the development machine does not need SSH access.
