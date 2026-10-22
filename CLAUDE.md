# StageDesk v2

See README.md for layout, commands and conventions. Build plan: https://claude.ai/artifact/2g4KvkN7ByigdSn5Vmh2aN

- Windows dev machine; Node 22 via nvm-windows; pnpm via corepack. Docker services run from `docker/compose.dev.yml` (MySQL on 3307 because XAMPP uses 3306).
- Next.js 16 with Cache Components: read `apps/web/node_modules/next/dist/docs/` before using an API you're unsure of. Request-time data (DB reads, cookies) goes in a component under `<Suspense>` and calls `connection()` or a runtime API.
- Prisma 7: config in `packages/db/prisma.config.ts`, MySQL through `@prisma/adapter-mariadb`, client generated to `packages/db/src/generated` (gitignored; run `pnpm db:generate`). Stay on 7.x until 8.0 is stable.
- The single `.env` is at the repo root; Next, Prisma and the worker load it from there.
- Money in integer cents, percentages in basis points. Business rules in `packages/core` with Vitest tests.
- Configurable business values (fees, plans, affiliate rates) go in the settings registry, not constants.
