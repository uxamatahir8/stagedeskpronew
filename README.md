# StageDesk

Bookings, quotes, payments and artist payouts for DJ and entertainment agencies in the Netherlands.

Build plan: https://claude.ai/artifact/2g4KvkN7ByigdSn5Vmh2aN

## Layout

| Path | What it is |
|---|---|
| `apps/web` | Next.js 16: marketing site, public booking pages, dashboard |
| `apps/worker` | BullMQ background jobs: the email queue, reminders, Stripe events, payouts, commissions |
| `packages/core` | Business rules: money, fees, settings, booking states. No framework code. |
| `packages/db` | Prisma 7 schema, migrations, client, settings service, seed |
| `packages/config` | Shared TypeScript config |
| `packages/payments` | Stripe: subscriptions, Connect onboarding, booking checkout, payouts, refunds, webhooks |
| `docker/` | Local services (MySQL, Redis, S3 storage, Mailpit, stripe-mock) |

## Requirements

- Node 22 (`nvm use 22`), pnpm via `corepack enable`
- Docker Desktop
- Stripe CLI, to forward webhooks once you add Stripe test keys

## First run

```sh
cp .env.example .env          # then set BETTER_AUTH_SECRET
pnpm install
pnpm services:up              # MySQL :3307, Redis :6379, storage :9000, Mailpit :8025
pnpm db:migrate               # apply migrations
pnpm db:seed                  # default settings + demo accounts (not in production)
pnpm db:seed-showcase         # optional: realistic bookings + a published demo website
pnpm dev                      # web on :3000 + worker
```

The demo agency's website is then at http://feestband-utrecht.localhost:3000 (Chrome and Edge
resolve `*.localhost` without any setup).

## Demo accounts

All use the password `StageDesk-demo-2026`. Emails sent by the app land in Mailpit.

| Email | Role | Agency |
|---|---|---|
| `admin@stagedesk.local` | Platform admin | — |
| `partner@stagedesk.local` | Affiliate (Pim, link `?via=pim`, code `PIM20`) | — |
| `eigenaar@feestband.local` | Agency owner | Feestband Utrecht |
| `beheer@feestband.local` | Agency admin | Feestband Utrecht |
| `planning@feestband.local` | Agency staff | Feestband Utrecht |
| `dj.sem@feestband.local` | Artist | Feestband Utrecht |
| `sanne@klant.local` | Customer (also try the email-code sign-in) | Feestband Utrecht |
| `eigenaar@rotterdamdj.local` | Agency owner | Rotterdam DJ Collectief |
| `dj.yara@rotterdamdj.local` | Artist | Rotterdam DJ Collectief |
| `bram@klant.local` | Customer | Rotterdam DJ Collectief |

## Public booking pages

Every agency has a public page at `/b/<slug>` (English: `/en/b/<slug>`), e.g.
http://localhost:3000/b/feestband-utrecht. Inquiries create the customer account and a booking in
"inquiry", email the customer and the agency (see Mailpit), and appear on the agency's home page.

Agencies can put the form on their own site:

```html
<script src="http://localhost:3000/embed.js" data-agency="feestband-utrecht" data-lang="nl" async></script>
```

Spam protection: Cloudflare Turnstile (the `.env.example` keys are Cloudflare's always-pass test
keys), a honeypot field, a minimum fill time, and Redis rate limits per IP and email.
All other pages refuse to be framed by other sites.

## Payments (Stripe)

Without keys the app runs normally: plans, trials, limits and offline payments work, and online
payment buttons explain that Stripe isn't connected yet. To switch on online payments:

1. In the Stripe dashboard (test mode), enable Connect (Express) and turn on iDEAL and cards for EUR.
2. Put `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in `.env`.
3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, and put the
   `whsec_...` it prints in `STRIPE_WEBHOOK_SECRET`. Restart `pnpm dev`.
4. As platform admin, open Plans and save each plan once to create its Stripe prices.

Money flow: the customer pays the platform on behalf of the agency (Checkout, iDEAL or card).
After the event plus the dispute window (Settings), the worker splits each payment with the fee
rule frozen when the quote was accepted and transfers the artist's and agency's shares. An
unconnected artist's share goes to the agency and is recorded as owed. Refunds reverse transfers
proportionally; the platform absorbs Stripe's unreturned fee. Every movement is in `ledger_entries`.

## Guided tour

The first time someone opens the app they get a short tour of their own panel: a welcome, every menu item
they can use (texts under `guides.nav_<key>`), search, notifications and the account menu. Steps they have
seen are stored in `user_guides`; when a menu item is added later, people get a short "New in StageDesk" tour
of just that. The account menu has "Take the tour" to see it again. E2E tests skip it in `settleOnDashboard`.

## Agency roles and permissions

Owners have every permission. What admins and staff may do is set per agency under Team → Roles and
permissions (26 permissions in six groups; stored in `organizations.rolePermissions`, defaults in
`packages/core/src/access.ts`). Billing and the permissions themselves stay with the owner; team
management, agency settings and refunds can't be given to staff. The viewer's permissions drive the
sidebar, pages, buttons (`<IfCan>`) and every server action (`requireAgency(permission)`).

## Affiliate program

Partners apply at `/partners`; the platform admin approves them under Affiliates, or adds them there
directly (approved at once, with a link and promo code). Partners can be edited or paused; one without
referrals or commission can be deleted. Program rules
(rate, period, cookie window, approval period, payout minimum and day, promo discount, give-a-month
reward, review threshold, tiers) are in Settings and apply to new referrals only.

- **Tracking:** partner links open agency registration (`/sign-up?via=<code>&c=<campaign>`); `?via=` on any
  page also works. It sets a first-party cookie and logs the click; only a new agency counts as a referral.
  When someone creates an agency, a partner code typed at onboarding wins; otherwise the last link
  within the cookie window counts. The referral, with its commission rate, is stored on the agency.
- **Commission:** from Stripe's `invoice.paid`, on the amount excluding VAT, for the referral's period.
  Pending for the approval period (default 7 days after the payment is confirmed), then approved by the
  worker; months above the review threshold
  wait for the admin. Refunds and disputes reduce or cancel unpaid commission.
- **Withdrawals** (default, `payoutMode: request`): the partner chooses how to be paid (Stripe, bank transfer
  or PayPal, as allowed in Settings) and requests a withdrawal of all approved commission above the minimum.
  The admin approves (Stripe withdrawals are transferred at once) or rejects with a reason; bank and PayPal
  withdrawals are marked paid with the transaction reference. Every step is an `affiliate_payout_events`
  row; each commission links to its withdrawal (`WD-XXXXXX`). In `automatic` mode the worker makes and
  pays a Stripe withdrawal on the payout day instead.
- **Reports:** Affiliates in the admin panel has Overview (money per stage, funnel, top partners, twelve
  months), Partners, Withdrawals (queue, actions, CSV) and Commissions (filterable, CSV). Partners see
  their balance, withdrawals with a timeline and every commission under Payouts.
- **Fraud rules:** no credit for the partner's own account or company email domain (public mailbox
  providers excepted); clicks are rate limited per visitor; blocked referrals are listed for the admin.
- **Give a month, get a month:** each agency has an invite link under Invite agencies (`?via=r-xxxxxx`),
  with the agencies that joined and the rewards.
  When the invited agency first pays, both get a Stripe balance credit.

## Dashboards, messages and notifications

- Every role has its own home page (`/app`): the platform admin sees revenue, growth and what needs
  attention; agencies their action queue, booked vs collected, this month's events, artist workload and
  plan usage; artists their requests and next gigs with the brief; customers a countdown and quick links.
  Charts use one SQL aggregate each (`packages/db/src/analytics.ts`) and have a table view.
- **Messages:** each booking has two conversations: agency with customer, and agency with the artist.
  Customers and artists also get an email for messages from the agency.
- **Notifications:** the bell is live over server-sent events (`/api/notifications/stream`); the full
  history is at `/app/notifications` (by day, unread filter, mark read, clear read).
- **Emails** all go through the worker's `email` queue with retries. If no worker is running (or Redis
  is down) the web app sends them itself, so sign-in codes always arrive. Run the worker with `pnpm dev`.
- **Reminders** (hourly): event reminders 7 days and 1 day before to customer and artist, quote expiry
  within 48 hours, and the balance-due reminder. Each is sent once (`reminder_logs`).
- **Support:** anyone signed in can ask a question at `/app/support`; platform admins answer from the
  same page.
- **Agencies (platform admin):** search by name, city, KvK or owner email; filter by status and plan;
  create an agency for an owner (the account is made if needed, the trial starts, a welcome email is
  optional). Each agency has its own page with stats, team, recent bookings and admin activity, where the
  admin edits details and internal notes, extends a trial, grants a plan without payment, sets a fee deal,
  suspends it (team locked out, booking page offline, nothing deleted) or deletes it (only without bookings
  or money records).
- **Platform admin bookings:** a platform admin creates a booking for any agency from Bookings →
  "Create booking" (or "Create booking" on an agency's page): pick the agency, an existing or new
  customer and the event, and optionally email the customer. The booking goes into the agency's queue
  as an inquiry (source `platform_admin`, shown as "created by platform admin (name)"), the agency
  team gets an email and a notification, and the overview confirms it with a link to open it. Bookings
  can be filtered by source; "Open" works on any booking through support mode.
- **Support mode:** "Work as support" on an agency page lets a platform admin act as that agency's
  admin (no billing) behind a banner; starting and leaving are audited.
- **Users (platform admin):** search, filter by role or status, add platform admins, edit details, sign
  out everywhere, disable, confirm email, reset 2FA, and delete accounts without history. Plus the Audit log.
- **Email previews (platform admin):** `/app/emails` shows every email in Dutch and English, as HTML
  at desktop or phone width and as plain text, rendered by the real senders from example data
  (`emailSamples` in `packages/emails/src/samples.ts`). "Send a test to me" mails the sample to the admin.
- **Loading bar:** a thin bar at the top shows page changes and server calls (`components/activity-bar.tsx`).
- **CSV export** for bookings, customers and payments (`/api/export/<kind>`).

## Website, pages and legal

- **Public site** (`app/[locale]/(marketing)`): home, features with four feature pages (`/features/<slug>`),
  solutions for weddings & events and band agencies (`/solutions/<slug>`), pricing (from the plans in Settings),
  about, for agencies, for artists, partner program, blog, help centre, changelog and contact, in Dutch and English.
  Feature and solution pages share `components/site/detail-page.tsx`; their copy is under `featureDetail.<slug>`.
- **Blog, help and changelog** live in the database and are managed under **Blog and help** in the admin panel:
  categories you create yourself, featured posts (the newest featured post opens the blog), cover images,
  scheduling, SEO title and description, and a Markdown editor with live preview. English is optional per
  article; without it English readers see the Dutch text with a notice. Starter content is Markdown in
  `packages/db/content` and is added by `pnpm db:seed` (or only that: `pnpm db:seed-content`); it never
  overwrites what was edited in the admin panel. Blog comments wait for approval under Pages → Blog comments.
- **Currencies:** each agency picks the currency it works in (Agency settings). A booking copies it when it is
  created, and its quotes, invoices, PDFs, emails, Stripe payments and payouts use it; changing the setting
  only affects new bookings. Fixed platform-fee amounts are set in euros and converted at the day's rate when
  a booking's fee is fixed. The worker fetches the ECB reference rates every six hours (`exchange_rates`).
  Visitors can show website prices in their own currency (header menu, cookie `display_currency`); plans are
  still billed in euros and the page says so.
- **Website texts** (`/app/texts`, platform admin): every text of the website and the app, in both languages,
  grouped per page, with search. Changes are stored in `site_texts` and merged over `apps/web/messages/*.json`
  in `i18n/request.ts` (cached, tag `site-texts`). A change may only use the placeholders and tags of the original
  (e.g. `{count}`, `<hl>`), so a page can never fail on it; resetting brings back the file text.
- **Page builder** (`/app/pages`, platform admin): Terms, Privacy and any other page, built from
  blocks (headings, text, lists, tables, images, callouts) in both languages, placed in the header or a footer
  column. Every save is a version; compare any version with the live one, restore it, or publish it.
- **Legal acceptance:** a legal page set to "ask everyone" (Terms) or "agency teams" (data processing
  agreement) is put to users at their next sign-in after a new version is published; `legal_acceptances`
  records who accepted which version, when and from which IP. The seeded legal pages are starter templates
  with [bracketed] details: have a lawyer review them before launch.
- **Waitlist mode** (Settings → Site): the site collects waitlist sign-ups instead of offering a trial;
  export them as CSV under Pages → Waitlist.
- **SEO:** canonical and hreflang links, Open Graph images (`/api/og`), `sitemap.xml`, `robots.txt`,
  and structured data (SoftwareApplication, FAQ, BlogPosting, TechArticle).

## Agency websites

Agencies build their own website under **Website** (permission `agency.settings`):

- **Editor:** pick a page in the toolbar, add sections (hero, text, highlights, artists, packages,
  reviews, gallery, video, FAQ, call to action, booking form, contact), drag them into order in the live
  preview, and edit the selected section on the right. The Page tab has the title, Google title and
  description, address, menu and order; the Design tab has colours, typeface, corners, header style and
  an optional English version. Drafts save automatically; **Publish** makes them live, and the site can be
  taken offline. Artists, packages and reviews come live from the agency's records.
- **Addresses:** every agency gets `<slug>.${SITES_BASE_DOMAIN}` for free (`feestband-utrecht.localhost:3000`
  in development). On plans with `customDomain` (Business) they connect their own domain: a CNAME to
  `SITES_CNAME_TARGET` and a TXT record `_stagedesk.<domain>` with the token shown, then **Check**. In
  development, deeper `.localhost` names (e.g. `www.mijnbureau.localhost`) are connected without DNS.
- **How it's served:** `src/proxy.ts` rewrites any host that isn't the platform's to
  `/sites/<host>/…` (no database work in the proxy); `lib/site-request.ts` resolves the live site. Each
  site has its own `sitemap.xml` and `robots.txt`. Plans with `removeBranding` hide "Made with StageDesk".
- **Production TLS:** point a wildcard and custom domains at the server and use Caddy on-demand TLS with
  `ask https://<app>/api/sites/tls-allowed`, which answers 200 only for verified domains and existing
  agency subdomains.

## Demo on localhost

Start Docker Desktop, then `pnpm services:up` and `pnpm dev` (web on :3000 and the worker). For a full
demo run `pnpm db:seed-showcase` once; run it again to reset the demo website after tests. Emails
arrive in Mailpit at http://localhost:8025. Password for every account: `StageDesk-demo-2026`.

| What to show | Sign in as | Where |
|---|---|---|
| Platform admin booking for an agency | `admin@stagedesk.local` | Bookings → Create booking (filter "platform admin") |
| Work inside an agency as support | `admin@stagedesk.local` | Agencies → an agency → Work as support |
| Leads from the StageDesk site | anyone, then admin | http://localhost:3000/request → Leads → offer to agencies |
| Accept a lead as an agency | `eigenaar@rotterdamdj.local` | Leads |
| Stripe keys and payment methods | `admin@stagedesk.local` | Payment setup |
| Bank transfer reported and confirmed | `sanne@klant.local`, then `eigenaar@feestband.local` | My payments → I've paid; then the booking → Confirm receipt |
| Agency website builder | `eigenaar@feestband.local` | Website (live at http://feestband-utrecht.localhost:3000) |
| Own domain (Business plan) | admin grants Business, then the agency owner | Website → Address & domain, e.g. `www.mijnbureau.localhost` |
| Email templates | `admin@stagedesk.local` | Emails |

## Local services

| Service | URL | Login |
|---|---|---|
| App | http://localhost:3000 | |
| Mailpit (test inbox) | http://localhost:8025 | |
| Storage console (RustFS) | http://localhost:9001 | `stagedesk` / `stagedesk-secret` |
| MySQL | `localhost:3307` | `stagedesk` / `stagedesk` |
| stripe-mock (API contract tests) | `localhost:12111` | |
| Prisma Studio | `pnpm db:studio` | |

## Payments setup

- **Stripe** keys are entered under Settings → Payment setup (encrypted in `platform_secrets` with
  `SECRETS_KEY`, falling back to `BETTER_AUTH_SECRET`; STRIPE_* in .env apply when none are saved).
  The page shows the webhook URL and the events to send, and tests the connection.
- **Payment methods:** the platform allows online, bank transfer and cash; each agency picks within
  that and enters its IBAN. Customers report a transfer or cash payment ("I've paid"); the agency
  confirms receipt (payment recorded, receipt emailed) or marks it not received with a note.

## Demo data and screenshots

- `pnpm db:seed-showcase` adds about twenty realistic bookings to the demo agency (customers on
  @voorbeeld.nl), so dashboards and charts look like a working agency.
- The website's product screenshots live in `apps/web/public/screens/<nl|en>/` and are shown by
  `components/site/screenshot.tsx` (home, /tour, feature and solution pages). They are captured from
  the running app with demo data and framed (browser window, phone, hero collage) by scripts; capture
  again after visible UI changes.

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test   # db tests use the stagedesk_test database
bash scripts/smoke-accounts.sh             # accounts and agency isolation, against pnpm dev
bash scripts/smoke-bookings.sh             # bookings, artists, customers and PDF access
bash scripts/smoke-payments.sh             # billing and payment screens by role
bash scripts/smoke-affiliates.sh           # partner page, link tracking, affiliate and admin screens
bash scripts/smoke-dashboards.sh           # dashboards, messages, support, admin tools, export, email queue
bash scripts/smoke-website.sh              # public site, SEO files, page builder access
pnpm --filter @stagedesk/web e2e           # Playwright: full booking flow in a real browser
```

The Playwright test needs Chromium once: `pnpm --filter @stagedesk/web exec playwright install chromium`.

Tests and smoke scripts leave accounts on test email domains in the dev database. `pnpm db:clean-test`
lists them; `pnpm db:clean-test --yes` removes them with their agencies, bookings and partner records
(demo accounts are kept).

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
