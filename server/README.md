# Wedding RSVP API

A private-link RSVP API for the existing React invitation. No guest accounts and no
public guest-registration or administration endpoints. The frontend RSVP section
loads each invitation's named guests and saves replies to this API. For the live
host and one test invitation, follow [RSVP setup](../deploy/RSVP-SETUP.md).

Uses TypeScript, Node's HTTP server, and `node:sqlite`. No extra runtime packages.
Deploy with Node 24; Node 22.16+ also works for local development with the scripts
below. Node 24's SQLite module is currently a release candidate, not a stable API;
pin/test your production Node image when upgrading.

## Local setup

Run from the repository root. Install the existing development packages with
`npm ci` if they are missing.

```powershell
$env:DATABASE_PATH = './data/rsvp.sqlite'
$env:ALLOWED_ORIGINS = 'http://localhost:5173'
$env:PUBLIC_BASE_URL = 'http://localhost:5173/wedding-invite/'
npm run api:admin -- import server/guests.example.csv --links private/invitation-links.csv
npm run api:dev
```

The example uses fictional names. Copy/edit the CSV under `private/` for real guests.
The `private/` and `data/` directories are ignored by Git and Docker. The API binds
to loopback on port 3001 locally. `server/.env.example` lists supported settings;
the scripts do not automatically load it. Set variables in your shell or use a
Node `--env-file` argument when starting the compiled entry point.

```sh
npm run api:build
npm run api:test
npm run rsvp:check
npm run rsvp:test
npm run api:start
```

`api:build` also type-checks the tests. The API test suite uses disposable databases
and an actual HTTP server on an ephemeral loopback port.

## REST contract

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | `/health/live` | None | Process responds |
| GET | `/health/ready` | None | Database is available |
| GET | `/api/invitation` | Bearer invitation token | Read this invitation and its current RSVP |
| PUT | `/api/rsvp` | Bearer invitation token | Replace this invitation's complete RSVP |
| OPTIONS | Either API path | Allowed origin/preflight | Browser CORS preflight |

API requests must send `Authorization: Bearer <token>`. Query parameters are
rejected. Never send API tokens in URLs, cookies, request bodies, or guest IDs.
New private frontend links use `#invite=<token>` so the secret is not sent in the
initial HTTP request. The frontend removes it from the displayed URL and keeps it
in memory plus tab-scoped session storage for reloads. Legacy `?invite=<token>`
links are also accepted and scrubbed. API requests use only the authorization
header; never put tokens in analytics. A token authorizes a household, not proof of a
person's identity: forwarded links work until revoked or replaced.

GET `/api/invitation` returns:

```json
{
  "label": "Alex and Jamie",
  "expiresAt": null,
  "guests": [
    { "id": "guest-uuid-1", "name": "Alex Example", "isPlusOne": false },
    { "id": "guest-uuid-2", "name": "Jamie Example", "isPlusOne": false }
  ],
  "rsvp": null,
  "revision": 0,
  "rsvpClosesAt": null,
  "canRespond": true
}
```

Use the actual guest IDs returned by GET, not the sample UUIDs. Send every invited
guest exactly once; named guests cannot be renamed. A plus-one is a preallocated
guest slot: set `is_plus_one=true` in the owner's CSV. Attending plus-ones must
supply their name. Declining plus-ones must omit `name` (or send null/empty text).

```json
{
  "revision": 0,
  "guests": [
    { "id": "guest-uuid-1", "attending": true, "dietaryRequirements": "Vegetarian" },
    { "id": "guest-uuid-2", "attending": false, "dietaryRequirements": "" }
  ],
  "notes": "Looking forward to it!"
}
```

`revision` is required and must be the version last read by the client. A successful
PUT returns the same invitation shape, with a non-null `rsvp` containing
`revision`, `notes`, `updatedAt`, and each guest's `id`, `attending`,
`dietaryRequirements`, and `name` (null for named guests). The top-level revision
increments on a new write. Repeating the immediately preceding successful PUT
with the same normalized answers is idempotent, preserving its timestamp/version.
An older conflicting write returns 409; reload and let the guest review before
resubmitting. Responses are saved in one SQLite transaction.

Text limits: guest/plus-one names 120 characters, dietary requirements 500 per
guest, notes 2,000, request body 16 KiB. Only JSON without content compression is
accepted. Unexpected properties, duplicate IDs, other households' IDs, invalid
types and extra attendees are rejected before any write. Text is plain data;
render it with React text nodes, never `dangerouslySetInnerHTML`.

Errors have this shape:

```json
{ "error": { "code": "revision_conflict", "message": "The RSVP has changed. Reload it before saving again." } }
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid payload, API query, or trusted proxy header |
| 401 | Missing, malformed, unknown, revoked, or expired invitation token |
| 403 | Disallowed browser origin, preflight, or RSVP deadline passed |
| 404 / 405 | Unknown endpoint / incorrect method |
| 409 | Conflicting stale RSVP revision |
| 413 / 415 | Body too large / unsupported media type or encoding |
| 429 | Rate limited; honor the `Retry-After` seconds header |
| 500 | Internal/database failure; response contains no internal details |

API responses use `Cache-Control: no-store`. CORS permits only configured exact
origins and never credentialed cookies. CORS is a browser policy, not invitation
authentication; non-browser requests must still carry a valid token. Add a
Cloudflare cache-bypass rule for `/api/*` so custom cache rules cannot override the
origin's private-response policy.

## Private owner commands

CSV header, in this exact order:

```csv
invitation_key,invitation_label,guest_name,is_plus_one,expires_at
alex,Alex and guest,Alex Example,false,
alex,Alex and guest,Guest of Alex,true,
```

One row per guest; repeating the invitation key groups a household. Keys use
1–80 letters/numbers/underscores/hyphens. `is_plus_one` is true, false, or empty.
Optional expiry is an ISO 8601 timestamp with an explicit timezone. Labels and
expiry must agree for all rows in a household; each invitation permits 1–20 guests.
Quoted commas, quotes, newlines, Unicode, and a UTF-8 BOM are supported.

```sh
npm run api:admin -- import private/guests.csv --links private/new-links.csv
npm run api:admin -- create-test --links private/test-guest-link.csv
npm run api:admin -- rotate alex --links private/replacement-link.csv
npm run api:admin -- revoke alex
npm run api:admin -- export private/responses.csv
npm run api:admin -- backup private/rsvp-backup.sqlite
```

Import creates new invitations and skips identical existing invitations, without
resetting tokens or responses. Existing keys with changed guest/label/expiry data
are rejected; editing household membership is intentionally not part of this
initial version. The entire import rolls back if a row conflicts or saving the
new link file fails. Import output contains links only for newly created
invitations. Output files must not already exist.

`create-test` is an explicit private owner action: it creates one named **Test
Guest** with the key `test-guest`, no plus-one, and a new random token. Nothing is
seeded automatically. If it exists, use `rotate test-guest` to replace its link
without resetting replies. Revoke it when finished.

Token secrets are generated from 32 cryptographically random bytes and only SHA-256
hashes are stored in SQLite. **The generated link CSV is the one-time secret
copy.** Keep it private. Lost links can be replaced using `rotate`; the old token
becomes invalid and existing responses stay intact. Rotation reactivates a revoked
invitation but does not change its original expiry. All commands access the database
directly, so access to the pod/database is owner access; do not expose these
commands as public API routes. CSV response exports neutralize spreadsheet formulas.

The backup command uses SQLite `VACUUM INTO` to make a consistent snapshot, including
committed WAL data. Copy backups to another machine/storage using your homelab's
backup system and schedule regular snapshots. Copying only the live `.sqlite` file
while the service is running may lose WAL transactions. To restore, stop the app,
preserve the current database/WAL/SHM files separately, replace the database with
the backup with matching permissions and no old WAL/SHM files alongside it, then
restart and verify responses. Backups contain guest data and token hashes.

## Configuration

| Variable | Default / purpose |
| --- | --- |
| `HOST` | `127.0.0.1`; container sets `0.0.0.0` |
| `PORT` | `3001` |
| `DATABASE_PATH` | `./data/rsvp.sqlite`; container uses `/data/rsvp.sqlite` |
| `ALLOWED_ORIGINS` | `http://localhost:5173`; comma-separated exact browser origins |
| `PUBLIC_BASE_URL` | Required by link-generation commands; actual frontend URL |
| `TRUST_CLOUDFLARE_PROXY` | `false`; enable only with tunnel-only ingress |
| `RATE_LIMIT_PER_IP` | `120` requests per minute, including failed authentication |
| `RATE_LIMIT_PER_INVITE` | `30` authenticated requests per minute per active token |
| `RSVP_CLOSES_AT` | Unset; optional server-enforced timezone-aware deadline |
| `STATIC_DIRECTORY` | Unset; optional built frontend directory to serve |

Rate-limit memory is bounded and counters reset on process restart. They are
intended for one app replica. Do not scale the app without replacing SQLite/local
limits with shared storage/limits. When proxy trust is disabled, spoofed forwarded
headers are ignored. Behind the tunnel, enable it only if your NetworkPolicy/CNI
and service exposure ensure other callers cannot supply forged `CF-Connecting-IP`.
This is rate-limit attribution; invitation authorization remains token-based.

The example Kubernetes configuration sets the deadline to the end of Friday,
11 December 2026 in Sydney (`2026-12-11T23:59:59+11:00`). Adjust/remove it as needed.
Expired/revoked tokens cannot read or write. A global RSVP deadline blocks writes
but keeps active invitations readable.

## ARM64 container and GitHub Actions

The supplied image serves both the built React frontend at `/` and the API at
`/api/*` on port 3001. SQLite runs inside the same Node process, with its database
at `/data/rsvp.sqlite`. Mount `/data` as a persistent volume so replacing the
container preserves invitations and replies. There is no separate database server
and no guest data or secrets are baked into the image. The private CLI is included.
The frontend form uses these same-origin endpoints, loads saved replies on return,
and confirms a save only after the server commits it.

`.github/workflows/api.yml` builds `linux/arm64` on a native `ubuntu-24.04-arm`
GitHub runner. During the build it compiles the frontend with `--base=/`, compiles
the API, and runs the API and frontend-client integration tests. A subsequent image smoke test checks
frontend assets, API authorization, and an RSVP surviving replacement of the
container with the same database volume. GitHub Pages keeps its existing separate
workflow and `/wedding-invite/` base.

Publishing uses BuildKit's registry exporter after the smoke tests succeed. The
publish step uses the same builder and build inputs, reusing its cached layers
instead of uploading the Docker-daemon-loaded copy with `docker push`. This follows
[Docker's test-before-push workflow](https://docs.docker.com/build/ci/github-actions/test-before-push/).
If a publishing workflow is changed, commit/push the change and start a new run;
re-running an old failed run uses that old commit's workflow definition.

After successful tests, the workflow publishes to
`ghcr.io/coolfox24/wedding-invite` using the repository's `GITHUB_TOKEN`:

- Pushes to the default branch publish that branch tag, `latest`, and `sha-<full-commit>`.
- `v*` Git tags publish the corresponding tag and commit tag; they do not move `latest`.
- Manual **Run workflow** runs publish the selected branch/tag and commit tags;
  `latest` is published only on the default branch.
- Pull requests and ordinary feature-branch pushes build/test without publishing.

The workflow requests `packages: write`; no Docker Hub login or extra publishing
secret is needed. If an existing GHCR package rejects pushes, give this repository
write access in the package settings. Packages may initially be private. Either
make the image public in GitHub package settings or authenticate your host to GHCR
with an account token permitted to read that package; use `docker login ghcr.io`
interactively or through your secret manager.

For a standard container host, copy `compose.yaml` and copy
`deploy/compose.env.example` to `.env`, then set your actual domain origin:

```sh
docker compose pull
docker compose up -d
docker compose ps
```

The Compose service binds `127.0.0.1:3001` for a tunnel/reverse proxy running on the
same host, and persists SQLite in the `wedding-data` named volume. Configure the
tunnel's public hostname to `http://localhost:3001`. If `cloudflared` itself runs
in Docker, put it on the same Docker network and target `http://wedding:3001`
instead. `TRUST_CLOUDFLARE_PROXY` defaults to false; enable it only when API traffic
cannot bypass the tunnel. Do not remove the named volume when updating the app;
`docker compose down --volumes` deletes its guest data. Continue to make external
database backups.

Run owner commands in the container with the private CLI, for example:

```sh
docker compose exec wedding mkdir -p /data/private
docker compose cp private/guests.csv wedding:/data/private/guests.csv
docker compose exec wedding node dist-server/cli.js import /data/private/guests.csv --links /data/private/new-links.csv
docker compose cp wedding:/data/private/new-links.csv private/new-links.csv
docker compose exec wedding node dist-server/cli.js export /data/private/responses.csv
docker compose exec wedding node dist-server/cli.js backup /data/private/rsvp-backup.sqlite
```

For reproducible deployments, replace `:latest` in Compose with a published commit
tag or digest. Local ARM64 builds are also supported:

```sh
docker buildx build --platform linux/arm64 --load -t wedding-invite:local .
```

## Kubernetes (optional)

Before applying `deploy/k8s/app.yaml`, replace the app image, public origins/base
URL, and storage class. Use block/local storage supporting SQLite file locks, not
an ordinary NFS share. One app replica and `Recreate` deployment avoid overlapping
writers. Pin image digests for repeatable production deployments.

```sh
kubectl apply -f deploy/k8s/app.yaml
```

Create a remotely managed tunnel in Cloudflare, then create the Kubernetes Secret
`cloudflared-token` with a `token` key using your secret manager. Do not commit the
token or place it in shell arguments/history. For example, after saving it into a
private file containing **only the token** through your secret manager:

```sh
kubectl -n wedding create secret generic cloudflared-token --from-file=token=/PRIVATE/PATH/tunnel-token
kubectl apply -f deploy/k8s/tunnel.yaml
```

Replace `cloudflared:latest` with a tested release/digest. In the tunnel dashboard,
map your API hostname (for example `rsvp.example.com`) to:

```text
http://wedding-api.wedding.svc.cluster.local:3001
```

For combined frontend/API hosting, map your wedding hostname to this service and
set `ALLOWED_ORIGINS` and `PUBLIC_BASE_URL` accordingly. If continuing to use GitHub
Pages temporarily, `ALLOWED_ORIGINS` must include the GitHub Pages origin (no
repository path), while `PUBLIC_BASE_URL` must include its actual
`/wedding-invite/` path. Guest API calls will target the API hostname.
Guests do not need a Cloudflare Access login. Do not route unrelated homelab
services or the Kubernetes API through this public tunnel.

NetworkPolicies assume an enforcing CNI, IPv4 outbound networking, and CoreDNS pods
labelled `k8s-app=kube-dns` in `kube-system`. Adapt DNS/CIDRs for node-local DNS,
custom service/pod networks or IPv6. API traffic is limited to `cloudflared` pods
in this namespace, with no API outbound traffic. Tunnel egress is restricted to
the API, cluster DNS, and public TCP/UDP 7844 plus HTTPS; node-originated probes
remain permitted by standard Kubernetes NetworkPolicy behavior. Limit RBAC so
untrusted users cannot create labelled pods or retrieve secrets in this namespace.

Run owner commands in the existing app pod, avoiding another pod mounting the
ReadWriteOnce volume. For example:

```sh
kubectl -n wedding exec deployment/wedding-api -- mkdir -p /data/private
kubectl -n wedding cp private/guests.csv WEDDING-API-POD:/data/private/guests.csv
kubectl -n wedding exec deployment/wedding-api -- node dist-server/cli.js import /data/private/guests.csv --links /data/private/new-links.csv
kubectl -n wedding cp WEDDING-API-POD:/data/private/new-links.csv private/new-links.csv
kubectl -n wedding exec deployment/wedding-api -- node dist-server/cli.js export /data/private/responses.csv
kubectl -n wedding exec deployment/wedding-api -- node dist-server/cli.js backup /data/private/rsvp-backup.sqlite
```

Replace `WEDDING-API-POD` with the pod name from `kubectl -n wedding get pods`.
Use new filenames for every export/backup. `/data/private` is not exposed by HTTP.
Avoid printing generated links in pod logs, tickets, or chat.

The container already sets `STATIC_DIRECTORY=/app/public-dist` for frontend
hosting. To override it, use only a directory of public build outputs, never the
repository root or data volume.

## References

- [Node SQLite API and stability](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [Cloudflare Tunnel on Kubernetes](https://developers.cloudflare.com/tunnel/guides/kubernetes/)
- [Tunnel firewall requirements](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/)
- [Kubernetes NetworkPolicy semantics](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- [SQLite deployment/storage guidance](https://www.sqlite.org/whentouse.html)
- [GitHub ARM64 runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Publishing container images with GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
