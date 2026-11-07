# Clerk Authentication Deployment Audit

## Active architecture

Clerk is the active identity provider. `/api/v1/auth/me` is the only auth route; there are no API
register/login/refresh/password-reset endpoints. `authenticate` reads a Bearer Clerk session token,
verifies it with `@clerk/backend` `verifyToken`, and maps the verified `sub` claim to an internal Cue
user. The API does not trust client-supplied internal IDs. Workspace membership and roles remain
Cue-owned and database-authorized.

The Electron renderer obtains a short-lived Clerk session JWT and syncs it over the typed preload
bridge. The main process keeps it in memory and attaches it as an Authorization Bearer header to API
requests. Clerk's Electron bridge owns persisted auth state via `safeStorage`; the API's Clerk Secret
Key and Nexconn App Secret remain server-side.

On first API-authenticated use, identity provisioning calls Clerk's Backend API to fetch a profile,
then creates an internal User keyed by the stable Clerk user ID. A unique-email conflict with another
internal account is rejected; there is no automatic email merge.

## Legacy self-managed authentication

The earlier self-managed system is no longer active in routes/middleware, but remnants remain:

- `User.passwordHash` is nullable and retained in the schema/migrations.
- `Session` model and `repositories/session.repo.ts` remain.
- Argon2 helpers, token hashing helpers, and legacy token TTL settings remain.
- `SESSION_SECRET` is still required by the production environment guard, despite no active current
  auth path using it.

Existing local-password accounts are not automatically converted or linked. Before production,
determine whether such users/session rows exist and agree a secure user-verification/account-link
flow. Do not link by matching email alone and do not drop legacy columns/tables in Phase 0.

## Identity provisioning issue

`realProfileFetcher()` chooses the Clerk primary email (or first listed email), then returns it as
the profile. It does not check the selected address's `verification.status`; the `NO_VERIFIED_EMAIL`
message therefore overstates the current check. Before production onboarding, explicitly require a
verified address or confirm and test that Clerk's production sign-in policy makes the selected
address verified. First login also requires `CLERK_SECRET_KEY`; `CLERK_JWT_KEY` alone can verify a
token but cannot call Clerk's Backend API to fetch the profile.

## Clerk dashboard and release requirements

| Requirement                                                                                                                              | Status                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Use one production Clerk instance for the Electron publishable key and API server keys                                                   | NEEDS USER ACTION                                                    |
| Enable Clerk Native API                                                                                                                  | NEEDS USER ACTION                                                    |
| Add actual dev origin (usually `http://localhost:5173`) and packaged `app://bundle` to allowed origins                                   | NEEDS USER ACTION                                                    |
| Allowlist `app://bundle/` for native OAuth callback                                                                                      | NEEDS USER ACTION                                                    |
| Enable and configure production Google OAuth credentials for sign-in and sign-up                                                         | NEEDS USER ACTION                                                    |
| Configure desired email/password or email-code and verification policies                                                                 | NEEDS USER ACTION                                                    |
| Set server `CLERK_SECRET_KEY` for first-user profile provisioning; optionally use `CLERK_JWT_KEY` for networkless signature verification | NEEDS USER ACTION                                                    |
| Set production `CLERK_JWT_ISSUER` and `CLERK_AUTHORIZED_PARTIES` to actual token claims/origins; set audience only if configured         | NEEDS USER ACTION                                                    |
| Build desktop with production public `VITE_CLERK_PUBLISHABLE_KEY`; do not place server keys in Vite vars                                 | NEEDS USER ACTION                                                    |
| Test packaged Windows Google OAuth deep-link callback, token verification, first-time provisioning, and email verification               | BLOCKED until deployment/config and production package are available |

Dashboard state was not inspected because no Clerk account connector/dashboard credentials were
provided. Source comments and `.env.example` describe intended settings; they are not evidence that
the live instance is configured correctly.

## Security boundary

The API calls the supported Clerk Backend verifier and optionally checks issuer, audience, and
authorized parties when configured. In production, code only enforces that at least one verification
key is present; the optional claim restrictions are not mandatory in code. Set and test them against
real Clerk tokens before release. Clerk's official Electron guidance requires Native API enablement
and origin allowlisting; see [Clerk Electron quickstart](https://clerk.com/docs/electron/getting-started/quickstart)
and [Electron SDK reference](https://clerk.com/docs/reference/electron/overview).
