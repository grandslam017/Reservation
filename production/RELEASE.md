# Signed GAS gateway candidate

This folder contains an undeployed candidate library for server-to-GAS signed requests.
It is not a complete production rollout or an automatically deployed Supabase function.

- `gas/SignedGateway.gs`: production-audience HMAC verification before existing handlers.
- `gas/Entrypoints.gs`: replacement wrappers for the existing entrypoints; never append duplicate functions.
- `server/gas-protocol.mjs`: trusted-server signing library; never expose as a generic browser signing API.
- `server/line-webhook-signature.mjs`: raw-byte LINE signature verifier; the caller must also check destination and persistently deduplicate events.
- `scripts/build-gas-candidate.cjs`: conservative source transformation into a separate output.
- `scripts/audit-release.cjs`: static diagnostic gate; does not grant production deployment approval.
- `sql/preflight.sql`: read-only access metadata queries.

Keep the existing Gemini key in Script Properties. The candidate needs a separate
server-only production transport secret, and does not rotate Gemini credentials.

Required GAS settings at a reviewed cutover: GAS_GATEWAY_ENVIRONMENT=production,
GAS_GATEWAY_MODE=SIGNED_ONLY, GAS_GATEWAY_SECRET=64-hex server-only secret.
Do not reuse browser-exposed credentials or credentials from another environment.

The signed-only entrypoint must be released together with authorized backend routes,
client integration, and verified LINE webhook forwarding. A signature proves trust
in the signer; the signer must authorize the operation and derive data from the
authoritative database rather than trusting a client payload.

Nonce capacity is bounded to 60 live envelopes; overflow fails closed. Envelopes
allow 120 seconds clock skew. Payloads are limited to 131072 JS code units. Large
backups/uploads and real-traffic capacity need separate compatibility testing.
Transport replay defense does not provide exactly-once business effects.

Run `node --test tests/production-gas-security.test.cjs`. These are synthetic
regressions, not evidence of a production cutover or a live LINE webhook test.
The source builder refuses unsupported entrypoint syntax and must operate on a
fresh reviewed source export. Retain a verified backup and coordinated rollback.

Reference: https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
