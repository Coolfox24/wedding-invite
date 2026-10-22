Deep forest green — #14251D
Dark emerald — #243C2D
Antique gold — #C8A85B
Warm parchment — #F0E4C8
Dark ink — #211C16

RSVP backend: see [server/README.md](server/README.md) for API endpoints, private guest
management, local development, and Docker/Kubernetes/Cloudflare Tunnel deployment.

The ARM64 image workflow builds the frontend and backend together and publishes
`ghcr.io/coolfox24/wedding-invite`. Use `compose.yaml` with
`deploy/compose.env.example` for a standard container host; `/data` holds the
persistent SQLite database.

To enable the connected RSVP form at `https://invite.sebmg.com` and create a
private invitation for one test guest, follow [the host setup commands](deploy/RSVP-SETUP.md).

