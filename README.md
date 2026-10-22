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
pnpm db:seed                  # default platform settings
pnpm dev                      # web on :3000 + worker
```

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
pnpm lint && pnpm typecheck && pnpm test
```

## Conventions

- Money is integer cents; percentages are basis points (1% = 100).
- Business rules live in `packages/core` and are called from the app and worker, never reimplemented.
- Fees, plans, affiliate rates and similar are settings (`packages/core/src/settings/registry.ts`),
  edited by the super admin. Records copy the setting they were created under.
- Role, organization and status are never read from client input.
