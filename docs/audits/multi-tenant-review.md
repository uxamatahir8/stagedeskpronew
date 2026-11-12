# Multi-tenant review

## What changed

- `FinancialOperation` carries `organizationId` and is listed in `tenantModels` (`packages/db/src/tenant.ts`). The schema test that enforces the list passes. Payments code reads it through the global client by id and always checks `organizationId` on reserve: a refund request for another agency's payment finds nothing (`not_found`), and a reused request id must match organisation, payment and amount.
- Refund request ids are namespaced by organisation (`refund:<org>:<uuid>`), so one agency can't collide with another's request.
- `assignLead` now runs on the winning agency's tenant client. Lead and offer rows are platform-level and are updated explicitly by `leadId`/`agencyId`. The customer membership and booking are created through the tenant client, so they're scoped to that agency.
- Booking row locks use raw `SELECT … FOR UPDATE` by id. The tenant-scoped read that follows (`tx.booking.findFirst`) still returns `not_found` for another agency's booking, so a foreign id can at most be locked for a moment, never read or changed.

## Existing guarantees relied on (not re-audited)

`tenantDb` scoping, `tenant.test.ts`, `messageAccess()`, `equipmentAccess()`, and the documented cross-agency reads (artist sharing, an artist's own gigs, public quote links, shared inventory).

## UNVERIFIED

A full sweep of direct `prisma.` (global client) usage in pages and actions, checking each for a missing organisation filter, was not done in this pass. Suggested method: `git grep -n "prisma\.\(booking\|payment\|quote\|artist\|member\)\." apps/web/src`, then for each hit confirm that an explicit `organizationId` or user-ownership filter is present.
