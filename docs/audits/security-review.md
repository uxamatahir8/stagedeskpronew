# Security review

Findings F-18…F-24, F-27, F-29, F-36 in `complete-code-review.md`. This is a targeted review, not a penetration test.

## Done

| Area | Result |
|---|---|
| Server actions (56 `"use server"` files) | Scripted check that every export starts with an auth gate, a token check or a rate limit. All flagged exports turned out to go through local gates (`agency()`, `editor()`, `gate()`/`equipmentAccess()`, `ownArtist()`, `adminSession()`), secret tokens, or Better Auth's own membership check (`switchOrganization` → `setActiveOrganization`). No unguarded action found. |
| Staff seats / invitations | Process-local state removed (F-18). A failing seat check now cancels the invitation instead of leaving it unchecked (F-19). Tested through Better Auth's real endpoints. |
| Rate limits | Atomic and self-repairing (F-20). Bounded in-memory fallback during a Redis outage (F-21). Client IP no longer chosen by the client once `TRUSTED_PROXIES` is set (F-22). |
| CAPTCHA | Fails closed in production without keys unless `TURNSTILE_DISABLED=true`. 5 s timeout. Cloudflare test keys rejected at start-up (F-23). |
| Start-up configuration | `checkProductionConfig` stops web and worker on missing services, short or placeholder secrets, non-https or localhost `APP_URL`, a Stripe mock URL, or missing/test Turnstile keys (F-24). |
| Webhook spoofing | Signature verification unchanged (`constructEvent`); a forged signature is rejected (existing test). |
| Exports | Each download is audited (`data.export`). Permissions per kind are unchanged. |
| Secrets in git | gitleaks over 121 commits: no leaks besides the fake keys in `secrets.test.ts` (allowlisted). |
| Dependencies | `pnpm audit --prod`: 1 moderate, 1 low, both in the `shadcn` CLI dependency chain (F-36). No high or critical. |
| Health endpoint | The public answer is only ok/not ok. Details need `HEALTH_TOKEN` (constant-time compare). |

## Not reviewed (UNVERIFIED)

- 2FA, email OTP, password reset and setup, session revocation and impersonation flows, read through or tested in this pass. They have existing e2e coverage, which was run (see `test-coverage.md`).
- CSP and security headers in `next.config.ts`.
- Upload handling (`lib/storage.ts`, site images): MIME/size validation and object storage ACLs.
- SSRF via `GEOCODER_URL` / custom-domain verification fetches.
- Tenant isolation beyond the existing `tenant.test.ts` and the new code paths. All new money code uses explicit `organizationId` checks or `tenantDb`. `FinancialOperation` is registered as a tenant model.

## Residual risks

- `TRUSTED_PROXIES` must be set in production, or rate-limit keys stay spoofable. The config check warns about it but doesn't block.
- Seat over-limit after a failed compensation isn't detected (F-34).
- `ledger_entries` immutability isn't enforced by the database.
