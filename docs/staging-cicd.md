# Staging CI/CD

Every push to the `staging` branch runs the normal lint, typecheck, and test
suite. If those checks pass, GitHub Actions deploys that exact commit to
`https://staging.stagedeskpro.com`.

The deployment job:

1. Connects as the non-root `stagedeskpro-staging` user with a dedicated
   GitHub Actions SSH key.
2. Takes an exclusive deployment lock so two releases cannot overlap.
3. Clones the verified commit into a new release directory.
4. Installs the locked pnpm dependencies and generates the Prisma client.
5. Builds the application before touching the running release.
6. Applies pending Prisma migrations.
7. Atomically switches `/home/stagedeskpro-staging/current` to the new release.
8. Restarts `stagedesk-web` and `stagedesk-worker` through PM2.
9. Checks the internal process and public HTTPS routes.
10. Restores the previous code release automatically if activation or health
    checks fail. Database migrations are not reversed, so migrations must stay
    backward compatible with the previous application release.

The workflow requires these GitHub Actions secrets:

- `STAGING_HOST`
- `STAGING_PORT`
- `STAGING_USER`
- `STAGING_SSH_KEY`
- `STAGING_KNOWN_HOSTS`

The server retains the active release and four previous releases. The shared
production `.env` remains outside release directories at
`/home/stagedeskpro-staging/htdocs/stagedesk-app/.env`.
