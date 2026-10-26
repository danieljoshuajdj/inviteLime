# Invite Lime — wedding invitation platform

One Next.js application, one database, one customer system, one admin system, one
template runtime and many templates. Public discovery → guest creation → payment →
publishing → sharing → customer account → administration all run through real
backend functionality (no mock data, no fabricated statistics).

The Stitch HTML files in the repository root (`admin panel.html`,
`public UI.html`, `public UI guest buy.html`,
`user account mobile and desktop.html`) are the **UI/UX reference**; the
application re-implements them as components over the real data model.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 App Router (`src/app`), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 (`@theme` tokens in `src/app/globals.css`), Playfair Display + Plus Jakarta Sans, Material Symbols |
| Database / auth / storage | Supabase (Postgres + RLS + `@supabase/ssr`) |
| Payments | Razorpay (server-side order creation, signature verification, webhook) |
| Email | Resend — transactional mail behind `src/lib/services/email.ts`; Supabase Auth signup/reset mail on Supabase's built-in sender until a domain is bought, then Resend SMTP (`npm run auth:smtp`) |
| Tests | Vitest (`npm test`) |
| Validation | Zod schemas in `src/lib/validators.ts` |

## Getting started

```bash
cp .env.example .env.local     # fill in Supabase, Razorpay, email + CRON_SECRET
npm install
npm run dev                    # http://localhost:3000
```

Apply the schema and seed data (Supabase CLI or SQL editor):

```bash
supabase db push               # supabase/migrations/00001_init.sql + 00002_ops.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

Promote your own account to admin:

```bash
npm run promote-admin -- you@example.com
```

Supabase Auth signup confirmation and password reset use Supabase's **built-in
sender** by default (confirmation stays enabled; the built-in sender allows
about 2 emails/hour and can land in spam — fine for development).

Once a sending domain is purchased and verified at resend.com/domains, switch
Auth mail to Resend's SMTP (needs `EMAIL_API_KEY` plus a Supabase access
token):

```bash
npm run auth:smtp -- --dry-run   # preview the settings, change nothing
npm run auth:smtp                # production sender on the verified domain
```

No domain verified yet? `npm run auth:smtp -- --sandbox` uses Resend's test
address `onboarding@resend.dev` instead — delivered **only** to your Resend
account's email and Resend testing addresses. To fall back to Supabase's
built-in sender again, clear the SMTP host in the dashboard
(Authentication → SMTP) or PATCH `config/auth` with `smtp_host: ""`.

Scripts: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`,
`npm run typecheck`, `npm test`, `npm run promote-admin`, `npm run auth:smtp`.

## Routes

| Area | Routes |
| --- | --- |
| Public site | `/`, `/templates`, `/templates/[slug]`, `/templates/[slug]/demo`, `/live-demos`, `/how-it-works`, `/features`, `/pricing`, `/about`, `/contact`, `/faq`, `/privacy`, `/terms` |
| Auth | `/login`, `/register`, `/forgot-password`, `/auth/update-password`, `/auth/callback` |
| Guest creation | `/create/new`, `/create/browse`, `/create/[token]` (builder: autosave draft, uploads, preview, checkout) |
| Customer app | `/app/explore` (default after login), `/app/favorites`, `/app/invitations`, `/app/invitations/[id]`, `/app/invitations/[id]/edit`, `/app/account` |
| Admin | `/admin/dashboard`, `/admin/templates`, `/admin/categories`, `/admin/users` |
| Invitation runtime | `/w/[slug]` |
| APIs | `/api/guest/*`, `/api/uploads`, `/api/assets/*` (hero imagery served from `src/assets`), `/api/orders`, `/api/payments/razorpay/verify`, `/api/payments/webhook`, `/api/rsvp`, `/api/weddings/[id]/*`, `/api/admin/*`, `/api/contact`, `/api/cron/maintenance` |

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Template system

A template is a normalized package (`index.html`, `manifest.json`, `assets/…`)
uploaded by an admin as a ZIP. Each upload becomes an **immutable version**
(`template_versions`, `storage_prefix = {templateId}/v{semver}`) and an
invitation stores the exact `template_version_id` it was purchased on, so later
template releases never alter a live invitation.

The runtime binds one standardized payload to the template:

* `src/lib/runtime/payload.ts` — payload contract (`window.__INVITE_LIME_RUNTIME__`,
  a `invite-lime:data` event and a `postMessage`), `<base href>` injection so
  relative asset paths resolve to object storage, and script-safe JSON.
* `src/lib/services/template-runtime.ts` — resolves the immutable version,
  fetches `index.html` (cached for a day: published assets are immutable) and
  produces the sandbox document.
* `src/components/runtime/TemplateFrame.tsx` — renders it in a `srcDoc` iframe
  **without `allow-same-origin`**, so template JavaScript runs on an opaque
  origin: no cookies, no localStorage, no platform or admin APIs. Only public
  invitation data is injected (never email, orders, user ids or payments).
* Demo mode boots the same package with an explicit demo dataset
  (`src/lib/services/demo-wedding.ts`) at `/templates/[slug]/demo`, always
  labelled “Demo Mode”.

If a package has not been uploaded yet, `/w/[slug]` falls back to the built-in
React runtime so a published invitation is never blank.

## Payments

1. `/api/orders` verifies the guest session, resolves the product price
   **server-side**, creates the draft wedding + Razorpay order and records it.
2. Razorpay Checkout collects payment in the browser.
3. `/api/payments/razorpay/verify` verifies the signature, fetches the order and
   payment from Razorpay, reconciles the amount against the product price, marks
   the order paid, then publishes. Publishing is idempotent: an already-active
   wedding returns the same slug/URL instead of a duplicate.
4. `/api/payments/webhook` is the authoritative confirmation —
   signature-verified, amount-reconciled, deduplicated per payment id, and it
   also records `payment.failed`.
5. After publishing, `linkInvitationToCustomer` attaches the invitation to the
   buyer's account (creating a passwordless account + access-link email when the
   checkout email has none). Failures are logged and never invalidate a paid
   invitation.

## Expiration, retention and background jobs

* Expiration is stored server-side as `wedding_date + 2 calendar months`
  (`src/lib/utils.ts`). `getPublicWedding` enforces it and
  `mark_expired_invitations()` flips the status; `/w/[slug]` 404s once expired.
* `/api/cron/maintenance` (protected by `CRON_SECRET`) is the retention job and
  is idempotent. Each run:
  1. expires invitations whose validity has passed;
  2. **purges expired and cancelled invitations** — every stored object
     (wedding folder, never-migrated draft uploads, keys recorded in
     `wedding_media`/`wedding_data`) is deleted from object storage *before*
     the row, then the row and what cascades off it (RSVPs, views, guest list,
     media records, email/analytics logs) go;
  3. **purges unpaid checkout drafts** older than
     `DRAFT_WEDDING_RETENTION_DAYS` (default 3) that never got a paid/refunded
     order;
  4. removes the stored folders of expired guest sessions — before
     `cleanup_expired_guest_data()` deletes the rows, since the session token is
     the only handle on those objects — then drops the draft/session rows and
     stale rate-limit counters.
* Order and payment history is **never deleted**: those rows stay with
  `wedding_id` set to NULL so revenue reporting survives a purge. Purges are
  batched (`PURGE_BATCH_SIZE`, default 10 per run, retried next run if storage
  fails) and the windows are env-tunable (`RETENTION_PURGE_GRACE_DAYS`, default
  0 = purge on the first run after the expiry day).
* Point any scheduler (Vercel Cron, Supabase pg_cron + pg_net, GitHub Actions,
  uptime service) at the endpoint daily:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/maintenance
```

* Backblaze tip: set both buckets' lifecycle to keep prior versions for
  0 days. Overwritten uploads otherwise stay in the bucket as hidden versions
  and keep being billed.

## Security

* RLS on every table (`supabase/migrations/00001_init.sql`): customers read and
  write only their own rows, admins through `is_admin()`, the public only active
  invitations. Server code re-checks ownership (`requireUser`, `requireAdmin`,
  explicit `user_id` comparisons).
* Admin APIs answer 401 for anonymous callers, 403 for signed-in non-admins
  (`src/lib/services/admin.ts` → `adminApiError`).
* Rate limiting lives in Postgres (`consume_rate_limit`, migration `00002_ops.sql`
  + `src/lib/services/ops.ts`) for guest session start, draft autosave, uploads,
  order creation, RSVP, email resend and admin destructive routes. It fails open
  so a database hiccup cannot take the platform down.
* Uploads are type/size validated (`src/lib/services/storage.ts`); template ZIPs
  are size-limited, path-traversal filtered and versioned.
* Security headers (`X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `X-Frame-Options`, `X-DNS-Prefetch-Control`) ship by
  default; the CSP is opt-in with `ENABLE_CSP=1` so it can be verified per
  environment before enforcement.
* Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET`, `EMAIL_API_KEY`, `CRON_SECRET`,
  `SUPABASE_ACCESS_TOKEN`) never reach the client bundle. Supabase Auth SMTP
  credentials live in Supabase's platform config (`npm run auth:smtp`), not in
  app code, and auth form errors are mapped to generic copy
  (`src/lib/auth-errors.ts`) instead of surfacing provider messages.

## Tests

```bash
npm test          # Vitest
npm run typecheck
npm run lint
npm run build
```

Unit tests cover the runtime payload contract + sandbox HTML injection, Razorpay
signature verification (checkout + webhook), validators (including reserved
slugs), pricing/date utilities and demo-data mapping.

## Known limitations

* The CSP ships disabled (`ENABLE_CSP=0`) — enable and verify it in staging.
* Customer images are stored as uploaded; no server-side re-encode pipeline yet.
* `email_deliveries` records provider responses, but provider bounce webhooks are
  not wired up yet.
* Admin dashboard ships live aggregate numbers; CSV export and per-range filters
  are the next admin iteration.
