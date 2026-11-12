# Production CI/CD

Production deploys the exact commit pushed to `main`, after the same `check`
and `security` jobs used by staging have passed. GitHub's `production`
environment holds a dedicated SSH key and the server connection settings.

The first deployment uses the environment variable
`PRODUCTION_DEPLOY_MODE=dark`. It starts and verifies the application on the
loopback-only production port without expecting public nginx traffic. After
the nginx cutover and public verification, set the variable to `live`; future
deployments then check the public production routes before completing.

Required production environment secrets:

- `PRODUCTION_HOST`
- `PRODUCTION_PORT`
- `PRODUCTION_USER`
- `PRODUCTION_SSH_KEY`
- `PRODUCTION_KNOWN_HOSTS`

The server layout is deliberately separate from staging:

- Site user: `stagedeskpro`
- Shared env: `/home/stagedeskpro/htdocs/stagedesk-app/.env`
- Releases: `/home/stagedeskpro/releases/<sha>`
- Live symlink: `/home/stagedeskpro/current`
- PM2 home: `/home/stagedeskpro/.pm2`
- Web port: `3000`, loopback only

`scripts/deploy-production.sh` validates the environment, installs locked
dependencies, generates Prisma, applies migrations, builds, switches the
release symlink, recreates the production web and worker processes, and runs
health checks. A failed activation restores the previous code release. Schema
migrations are not rolled back, so production migrations must remain backward
compatible.

Before promoting `staging` to `main`:

1. Verify a current database backup and restore rehearsal.
2. Run `scripts/check-env.mjs` for both `web` and `worker`.
3. Confirm production Stripe, Turnstile, SMTP, storage, Redis and database
   isolation.
4. Keep nginx on the old upstream until the dark launch passes.
5. After cutover, verify `/api/health`, `/`, `/nl`, `/nl/sign-in`, public forms,
   authentication email, uploads and Stripe webhooks.
