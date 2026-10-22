# StageDesk

Bookings, quotes, payments and artist payouts for DJ and entertainment agencies in the Netherlands.

Build plan: https://claude.ai/artifact/2g4KvkN7ByigdSn5Vmh2aN

## Layout

| Path | What it is |
|---|---|
| `apps/web` | Next.js 16: marketing site, public booking pages, dashboard |
| `apps/worker` | BullMQ background jobs (emails, Stripe events, payouts) |
| `packages/core` | Business rules: money, fees, settings, booking states. No framework code. |
| `packages/db` | Prisma 7 schema, migrations, client, settings service, seed |
| `packages/config` | Shared TypeScript config |
| `docker/` | Local services (MySQL, Redis, S3 storage, Mailpit) |

## Requirements

- Node 22 (`nvm use 22`), pnpm via `corepack enable`
- Docker Desktop
- Stripe CLI (from Phase 5)

## First run

```sh
cp .env.example .env          # then set BETTER_AUTH_SECRET
pnpm install
pnpm services:up              # MySQL :3307, Redis :6379, storage :9000, Mailpit :8025
pnpm db:migrate               # apply migrations
pnpm db:seed                  # default settings + demo accounts (not in production)
pnpm dev                      # web on :3000 + worker
```

## Demo accounts

All use the password `StageDesk-demo-2026`. Emails sent by the app land in Mailpit.

| Email | Role | Agency |
|---|---|---|
| `admin@stagedesk.local` | Platform admin | — |
| `partner@stagedesk.local` | Affiliate | — |
| `eigenaar@feestband.local` | Agency owner | Feestband Utrecht |
| `beheer@feestband.local` | Agency admin | Feestband Utrecht |
| `planning@feestband.local` | Agency staff | Feestband Utrecht |
| `dj.sem@feestband.local` | Artist | Feestband Utrecht |
| `sanne@klant.local` | Customer (also try the email-code sign-in) | Feestband Utrecht |
| `eigenaar@rotterdamdj.local` | Agency owner | Rotterdam DJ Collectief |
| `dj.yara@rotterdamdj.local` | Artist | Rotterdam DJ Collectief |
| `bram@klant.local` | Customer | Rotterdam DJ Collectief |

## Local services

| Service | URL | Login |
|---|---|---|
| App | http://localhost:3000 | |
| Mailpit (test inbox) | http://localhost:8025 | |
| Storage console (RustFS) | http://localhost:9001 | `stagedesk` / `stagedesk-secret` |
| MySQL | `localhost:3307` | `stagedesk` / `stagedesk` |
| Prisma Studio | `pnpm db:studio` | |

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test   # db tests use the stagedesk_test database
bash scripts/smoke-accounts.sh             # accounts and agency isolation, against pnpm dev
bash scripts/smoke-bookings.sh             # bookings, artists, customers and PDF access
pnpm --filter @stagedesk/web e2e           # Playwright: full booking flow in a real browser
```

The Playwright test needs Chromium once: `pnpm --filter @stagedesk/web exec playwright install chromium`.

## Conventions

- Money is integer cents; percentages are basis points (1% = 100).
- Business rules live in `packages/core` and are called from the app and worker, never reimplemented.
- Fees, plans, affiliate rates and similar are settings (`packages/core/src/settings/registry.ts`),
  edited by the super admin. Records copy the setting they were created under.
- Role, organization and status are never read from client input.
- Agency data is read and written through `requireAgency()` → `tenantDb(organizationId)`, which
  limits every query to the signed-in user's agency. The plain `prisma` client is for platform code.
- Booking status only changes through the operations in `packages/db/src/bookings.ts`, which call
  core's `transition()`. Quotes are versioned; payments and invoices are never cascade-deleted.
