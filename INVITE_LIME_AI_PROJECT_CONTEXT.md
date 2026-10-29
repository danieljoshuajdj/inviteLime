# Invite Lime AI Project Context

## Canonical Architecture, Rules, Current Status, and Production Checklist

> **Purpose:** This file is the persistent project context for AI coding
> agents working on Invite Lime.
>
> **Instruction:** Read this file before modifying the project. Treat it
> as the project's architectural memory and working contract.
>
> **Primary rule:** Do not redesign or rebuild working architecture.
> Inspect the repository first, identify the exact gap, make the
> smallest correct change, test it, and update this checklist.

------------------------------------------------------------------------

# 1. PROJECT IDENTITY

**Project:** Invite Lime\
**Repository:** `event-invitation-app`\
**Product:** Production wedding invitation platform\
**Current architecture:** One platform, one database, many independent
invitation templates, many customers\
**Primary stack from latest verified report:**

-   Next.js 16.3.6
-   App Router
-   React 19.2.8
-   TypeScript strict mode
-   Tailwind CSS v4
-   Supabase
-   PostgreSQL
-   Supabase Auth
-   Object storage (Supabase Storage or Backblaze B2 via a
    provider-independent storage abstraction)
-   Razorpay
-   Resend
-   Vitest

The latest source-verified project report dated **25 Sep 2026**
describes the repository as approximately **70% complete**, despite
earlier estimates of 85--90%. The 70% assessment must be treated as the
current baseline because it was based on direct source inspection and
identified real production blockers.

Latest verified repository metrics:

-   152 source files in `src/`
-   84 `.tsx`
-   62 `.ts`
-   1 `.css`
-   approximately 16,147 lines of source
-   24 API route handlers plus auth/callback and logout
-   22 database tables
-   53 RLS policies
-   13 SQL functions
-   7 triggers
-   37 indexes
-   2 storage buckets
-   235 passing tests (vitest, 21 test files, zero failures)
-   `npm run build` passes
-   `npm run typecheck` passes
-   lint currently has pre-existing errors/warnings
-   environment credentials are placeholders
-   migrations have not yet been applied against a real production
    Supabase project

------------------------------------------------------------------------

# 2. AI WORKING CONTRACT

Every AI coding agent must follow these rules.

## Rule 1: Inspect first

Before changing anything:

1.  Inspect repository structure.
2.  Inspect relevant source files.
3.  Inspect database migrations.
4.  Inspect existing APIs.
5.  Inspect RLS policies.
6.  Inspect existing components.
7.  Inspect existing tests.
8.  Search for duplicate implementations before adding new ones.

Never assume a feature is missing simply because it is not obvious from
the UI.

## Rule 2: Preserve working architecture

Do not replace:

-   Supabase
-   existing authentication architecture
-   existing RLS
-   Razorpay flow
-   existing template sandbox
-   immutable template versions
-   existing invitation runtime
-   existing database model

unless a verified defect requires a change.

## Rule 3: No parallel systems

Do not create:

-   a second authentication system
-   a second template runtime
-   a second payment flow
-   duplicate APIs
-   duplicate database tables
-   duplicate wedding JSON schemas
-   separate template applications
-   customer-specific deployments

Extend the existing implementation.

## Rule 4: No fake functionality

Never fabricate:

-   statistics
-   reviews
-   customer counts
-   delivery states
-   analytics
-   payment states
-   locations
-   latency
-   testimonials
-   usage numbers

If real data does not exist, show an honest empty state or clearly
labeled demo content.

## Rule 5: No dead UI

Every visible button must either:

-   perform its intended action
-   navigate to a real route
-   open a functional modal
-   submit a functional operation

Otherwise remove it or implement it.

## Rule 6: Security is server-side

Never trust frontend:

-   price
-   role
-   ownership
-   payment status
-   invitation status
-   file type
-   file size
-   publish permission
-   RSVP permission

Validate again on the server.

## Rule 7: Test every meaningful change

At minimum:

``` text
npm run lint
npm run typecheck
npm run build
npm test
```

For database/security changes, add or run integration tests.

For critical flows, run E2E tests.

## Rule 8: Do not hide errors

Never solve a failing build by:

-   disabling type checking
-   suppressing errors
-   deleting tests
-   weakening security
-   hiding exceptions
-   replacing real functionality with mocks

Fix the underlying problem.

------------------------------------------------------------------------

# 3. PRODUCT PRINCIPLE

Invite Lime is:

``` text
ONE PLATFORM
+
ONE DATABASE
+
ONE STANDARDIZED WEDDING DATA CONTRACT
+
MANY INDEPENDENT TEMPLATE PACKAGES
+
MANY IMMUTABLE TEMPLATE VERSIONS
+
MANY CUSTOMERS
+
MANY PERSONALIZED INVITATIONS
```

A new template must be uploadable through the Admin Panel without:

-   modifying application source code
-   adding a new React route
-   creating a new application
-   installing npm dependencies
-   rebuilding the main application
-   deploying another application

------------------------------------------------------------------------

# 4. CORE DOMAIN SEPARATION

Keep these three things strictly separate:

``` text
TEMPLATE
    |
    | design + HTML + CSS + JS + reusable assets
    v
STANDARD WEDDING JSON
    |
    | customer-specific structured information
    v
CUSTOMER MEDIA
    |
    | customer-uploaded photos/videos
    v
PERSONALIZED INVITATION
```

Never merge customer data into template source files.

Never copy template assets into each customer's wedding storage.

------------------------------------------------------------------------

# 5. TEMPLATE ARCHITECTURE

## Canonical package

Every uploaded template must use:

``` text
template-slug/
├── index.html
├── manifest.json
└── assets/
    ├── images/
    ├── videos/
    ├── audio/
    └── fonts/
```

Example:

``` text
royal-mughal.zip
└── royal-mughal/
    ├── index.html
    ├── manifest.json
    └── assets/
        ├── images/
        ├── videos/
        ├── audio/
        └── fonts/
```

## Templates are self-contained

Templates do not require:

-   React
-   Next.js
-   package.json
-   node_modules
-   npm install
-   main application source
-   application rebuild

JavaScript is allowed.

The template is untrusted content and must run inside the existing
sandboxed runtime.

------------------------------------------------------------------------

# 6. TEMPLATE UPLOAD FLOW

Canonical flow:

``` text
ADMIN
  |
  v
Templates
  |
  v
Upload Template
  |
  v
Select ZIP
  |
  v
Upload
  |
  v
Temporary storage
  |
  v
Safe extraction
  |
  v
ZIP validation
  |
  v
Manifest validation
  |
  v
Asset/reference validation
  |
  v
Security validation
  |
  v
Create template
  |
  v
Create template version
  |
  v
Store immutable assets
  |
  v
Generate/prepare preview
  |
  v
Admin review
  |
  v
Save draft
  |
  v
Publish
  |
  v
Template becomes available
```

Publishing must never occur before validation.

------------------------------------------------------------------------

# 7. TEMPLATE ZIP SECURITY

Uploaded ZIP files are untrusted.

Protect against:

-   path traversal
-   `../`
-   absolute paths
-   ZIP bombs
-   excessive decompressed size
-   excessive file count
-   executable files
-   server-side scripts
-   nested archives
-   unsupported file types
-   oversized individual files
-   malformed archives
-   arbitrary filesystem writes

Never extract directly into application source directories.

Use temporary controlled storage.

------------------------------------------------------------------------

# 8. TEMPLATE VALIDATION

Required:

``` text
index.html
manifest.json
assets/
```

Validate:

-   valid JSON
-   manifest schema
-   entry file exists
-   asset references
-   images
-   video
-   audio
-   fonts
-   relative paths
-   supported file types
-   reasonable file sizes
-   unsafe files
-   nested structure
-   missing files

Validation result should distinguish:

``` text
PASS
WARNING
ERROR
```

Warnings may be reviewed by admin.

Errors prevent publishing.

------------------------------------------------------------------------

# 9. TEMPLATE MANIFEST

Canonical concept:

``` json
{
  "schemaVersion": "1.0",
  "id": "royal-mughal",
  "name": "Royal Mughal",
  "version": "1.0.0",
  "entry": "index.html",
  "features": {
    "couple": true,
    "families": true,
    "events": true,
    "gallery": true,
    "countdown": true,
    "music": true,
    "video": true,
    "dress": true,
    "rsvp": true,
    "story": true
  }
}
```

Manifest describes template capabilities.

Manifest must NOT contain customer wedding data.

------------------------------------------------------------------------

# 10. TEMPLATE VERSIONING

Template versions are immutable.

Example:

``` text
Royal Mughal
├── v1.0.0
├── v1.1.0
└── v2.0.0
```

Existing invitations pin an exact version:

``` text
wedding.template_version_id
```

If v2.0.0 is published, existing v1.0.0 invitations remain on v1.0.0.

New customers use the latest published version.

Never silently migrate an existing live invitation.

Never overwrite published template assets.

------------------------------------------------------------------------

# 11. TEMPLATE STORAGE

Conceptual storage:

``` text
/templates/{templateId}/{version}/
    index.html
    manifest.json
    assets/
```

Customer storage:

``` text
/weddings/{weddingId}/
    photos/
    videos/
```

Template assets are reusable.

Customer media is customer-specific.

------------------------------------------------------------------------

# 12. TEMPLATE RUNTIME

The existing runtime is a strong part of the project and must be
preserved.

Current architecture:

-   immutable template packages
-   `srcDoc` iframe
-   sandboxed iframe
-   no `allow-same-origin`
-   opaque origin
-   template JS cannot access application cookies/localStorage
-   template cannot directly access platform APIs
-   demo and customer mode use the same runtime

Existing runtime concepts include:

``` text
window.__INVITE_LIME_RUNTIME__
```

and:

``` text
invite-lime:data
```

and `postMessage`.

Do not replace this with an unsafe direct execution model.

------------------------------------------------------------------------

# 13. TEMPLATE DATA BINDING

Templates consume standardized data.

Example:

``` html
<h1 data-wedding="couple.bride.name"></h1>
<h1 data-wedding="couple.groom.name"></h1>

<img data-wedding-image="couple.bride.photo">
<img data-wedding-image="couple.groom.photo">

<span data-wedding="wedding.date"></span>
<span data-wedding="wedding.time"></span>
<span data-wedding="wedding.venue"></span>

<a data-wedding-href="wedding.mapsUrl">
  View Location
</a>
```

Dynamic collections use runtime rendering.

Templates never directly query the private database.

------------------------------------------------------------------------

# 14. STANDARD WEDDING JSON

Canonical conceptual contract:

``` json
{
  "invitationType": "wedding",

  "couple": {
    "bride": {
      "name": "",
      "photo": null,
      "animatedPose": "",
      "bio": ""
    },
    "groom": {
      "name": "",
      "photo": null,
      "animatedPose": "",
      "bio": ""
    },
    "couplePhoto": null,
    "story": ""
  },

  "families": {
    "bride": {
      "father": "",
      "mother": ""
    },
    "groom": {
      "father": "",
      "mother": ""
    }
  },

  "events": [],

  "media": {
    "bridePhoto": null,
    "groomPhoto": null,
    "couplePhoto": null,
    "gallery": [],
    "video": null
  },

  "music": {
    "enabled": false,
    "trackId": null
  },

  "dress": {
    "enabled": false,
    "bride": {
      "color": null,
      "colorName": ""
    },
    "groom": {
      "color": null,
      "colorName": ""
    }
  },

  "rsvp": {
    "enabled": false,
    "deadline": "",
    "contactName": "",
    "contactPhone": "",
    "whatsapp": ""
  },

  "display": {
    "gallery": true,
    "countdown": true,
    "rsvp": false,
    "families": true,
    "story": true,
    "video": true,
    "dress": false
  }
}
```

The actual database schema is the source of truth for persisted fields.
Do not invent database fields without inspecting the migrations.

------------------------------------------------------------------------

# 15. REQUIRED WEDDING DATA

At minimum:

-   bride name
-   groom name
-   at least one event
-   event name
-   event time

Events are unlimited:

``` text
events[]
```

Never hardcode:

``` text
event1
event2
event3
```

------------------------------------------------------------------------

# 16. CONDITIONAL RENDERING

Optional content must disappear cleanly.

Examples:

``` text
bride photo exists
    -> show bride photo

bride photo missing + animated pose exists
    -> show animated pose

both missing
    -> hide image section
```

``` text
gallery.length > 0
    -> show gallery

gallery.length === 0
    -> hide gallery
```

``` text
rsvp.enabled
    -> show RSVP
```

``` text
video exists
    -> show video
```

Never render:

-   undefined
-   null
-   broken image
-   broken video
-   empty placeholder

------------------------------------------------------------------------

# 17. DEMO MODE

Every template must support demo mode.

Concept:

``` text
Template
+
Demo JSON
+
Demo media
=
Actual template runtime
```

Do not build screenshot-based fake previews.

Demo mode and customer mode must share the same rendering system.

------------------------------------------------------------------------

# 18. CUSTOMER TEMPLATE SWITCHING

Before publishing:

``` text
Wedding Data
   |
Template A
   |
Preview
   |
Change Template
   |
Template B
   |
Preview
```

Wedding data remains unchanged.

Only presentation changes.

Published invitations must not be silently broken by template changes.

------------------------------------------------------------------------

# 19. DATABASE CURRENT STATE

Verified current architecture contains 22 tables.

Important domain areas include:

-   users/profiles
-   guest sessions
-   guest drafts
-   templates
-   template versions
-   categories
-   category relationships
-   weddings
-   wedding events
-   wedding media
-   favorite templates
-   orders
-   payments
-   RSVP responses
-   invitation views
-   email deliveries
-   audit logs
-   analytics events
-   site settings
-   products
-   guest list

The exact schema must always be checked in the current migration files
before modifying it.

------------------------------------------------------------------------

# 20. STORAGE CURRENT STATE

Two logical storage areas:

``` text
templates
weddings
```

Template packages are public, reusable, immutable product assets.

Wedding media is private.

Important verified defect:

> The wedding bucket is private, but older storage code called
> `getPublicUrl()` and stored that URL for customer media.

Current source no longer does this. Wedding media is written into the
`weddings` area and addressed exclusively through the `mediaUrlForPath`
app route (`/api/media/...`), which re-authorizes the caller on every
request before streaming the bytes with the service role / B2
credentials. No `getPublicUrl()` call remains for wedding media.

Storage backend selection (since the storage-abstraction change):

``` text
B2_ENDPOINT + B2_KEY_ID + B2_APPLICATION_KEY set
    -> Backblaze B2 (both buckets PRIVATE; templates delivered via signed
       /api/templates proxy, weddings only via /api/media)
otherwise
    -> Supabase Storage (buckets `templates`, `weddings`, created by migration 00001)
```

See section 105 for the full storage-abstraction contract.

Preferred approach (now the implemented design):

-   keep private wedding media private
-   use a controlled media-serving endpoint (`/api/media/...`) or
    short-lived signed URLs for any future direct-access need
-   ensure published public invitation can render only the intended
    public media
-   do not expose arbitrary private files

------------------------------------------------------------------------

# 21. AUTHENTICATION

Existing:

-   Supabase Auth
-   SSR
-   customer
-   planner
-   admin

Authorization must exist at:

1.  route layer
2.  API layer
3.  database/RLS layer where applicable

Never rely solely on client-side checks.

------------------------------------------------------------------------

# 22. ADMIN AUTHORIZATION

Expected behavior:

``` text
anonymous -> admin
401 / redirect

customer -> admin API
403

admin -> admin API
200
```

The temporary development-only admin preview mode must never operate in
production.

Current preview mechanism from the verified report:

``` text
ADMIN_UI_PREVIEW=1
```

It is intended only for development UI preview.

Before production:

``` text
ADMIN_UI_PREVIEW=0
```

or remove the bypass entirely if no longer needed.

------------------------------------------------------------------------

# 23. CRITICAL P0 DEFECTS

These are the highest priority current defects.

## P0-1 RSVP always returns 500

Current issue:

-   database has partial unique index on `(wedding_id, email)` where
    email is not null
-   API upsert uses `onConflict: "wedding_id,email"`
-   Postgres cannot infer the partial index for that conflict clause

Required fix:

Choose a correct schema/API strategy.

Preferred simple strategy if product rules permit:

-   replace partial uniqueness with an appropriate unique constraint
    compatible with the upsert

Then verify:

-   first RSVP
-   repeated RSVP
-   update existing RSVP
-   email normalization
-   null email behavior

Do not simply hide the 500.

------------------------------------------------------------------------

# 24. P0-2 Guest Photos Do Not Load

Current issue (historical):

-   weddings storage bucket is private
-   old code used `getPublicUrl()`
-   private bucket public URLs do not provide working access

Status: resolved in source. All media is delivered through the
`/api/media/[...path]` proxy, which re-authorizes each request against
the wedding record, guest draft session, or owner/admin session before
streaming the object. The delivery layer is provider-independent: it
uses the storage abstraction's `download()` against the `weddings`
area on Supabase Storage or Backblaze B2.

Required verification (not yet run against real storage):

-   upload
-   database reference
-   builder preview
-   published invitation
-   unauthorized private media access

------------------------------------------------------------------------

# 25. P0-3 Razorpay Webhook Signature

Current verified issue:

Existing implementation hashes only:

``` text
body
```

but the expected timestamped scheme uses:

``` text
timestamp|body
```

with timestamp and digest in the webhook signature format.

Required work:

-   implement correct signature verification according to the configured
    Razorpay webhook contract
-   validate timestamp/replay window if supported by the integration
-   reject malformed signatures
-   reject stale/replayed requests
-   preserve idempotency

Add tests for:

-   valid signature
-   invalid signature
-   modified body
-   modified timestamp
-   replay/stale timestamp
-   duplicate webhook

Do not invent a scheme. Verify against the provider
documentation/configuration before final implementation.

------------------------------------------------------------------------

# 26. P0-4 Service-Role Admin Promotion

Current issue:

A `SECURITY DEFINER` trigger/function checks `current_user`, which is
the definer context rather than the caller context.

Required fix:

Use the appropriate Supabase/Postgres auth-role mechanism, such as the
verified recommended predicate:

``` sql
(select auth.role()) <> 'service_role'
```

Test:

-   normal customer cannot self-promote
-   admin remains protected
-   service-role administrative operation works
-   trigger still blocks privilege escalation

------------------------------------------------------------------------

# 27. P0-5 Invalid `now()` Partial Indexes

Current verified issue:

Some partial indexes use `now()` in predicates.

PostgreSQL requires immutable expressions in index predicates.

Required fix:

Remove time-dependent partial-index predicates.

Replace with:

-   ordinary indexes
-   status columns
-   generated/maintained values
-   query-time filtering
-   appropriate immutable predicates

Then verify:

``` text
supabase db reset
```

works from a clean environment.

------------------------------------------------------------------------

# 28. SECURITY P1 DEFECTS

## P1-1 Public EXECUTE grants

Functions including rate-limit/cleanup functions must not accidentally
remain executable by `PUBLIC`.

Audit:

``` text
REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC;
```

Then explicitly grant only required roles.

------------------------------------------------------------------------

# 29. P1-2 Rate-limit client key

Current implementation trusts a client-supplied `x-forwarded-for`
leftmost value.

This can be spoofed/rotated.

Required:

-   determine trusted proxy behavior
-   use platform-provided trusted client information where available
-   never trust arbitrary browser-provided forwarding headers
-   document proxy assumptions

Rate limiting must not become trivially bypassable.

------------------------------------------------------------------------

# 30. P1-3 Guest session exposure

Current verified issue:

Authenticated users may have a SELECT path to guest sessions/access
tokens.

Guest session access tokens are takeover credentials.

Required:

-   remove broad authenticated SELECT
-   ensure users cannot read another guest session
-   expose only safe session metadata where required
-   never expose access tokens unnecessarily

Test cross-user access.

------------------------------------------------------------------------

# 31. P1-4 Email Deduplication

Current email dedupe is inverted.

Required behavior:

``` text
Check whether equivalent email already sent
        |
        +-- yes --> do not send duplicate
        |
        +-- no --> send
                    |
                    +--> record delivery
```

Dedupe key should include the wedding context where required, for
example:

``` text
template_key
to_email
wedding_id
```

Check BEFORE sending.

Do not record a fake successful send before transmission.

------------------------------------------------------------------------

# 32. P1-5 Guest Draft Autosave

Current issue:

`save_guest_draft` may INSERT repeatedly instead of updating the
existing draft.

Required:

-   upsert by session/draft identity
-   preserve one logical draft
-   update timestamps
-   prevent unbounded row growth
-   retain 14-day cleanup behavior

Test many autosaves.

------------------------------------------------------------------------

# 33. P1-6 RLS Hardening

Audit all 22 tables.

Do not assume `USING` alone protects INSERT/UPDATE.

Where required, use:

``` text
WITH CHECK
```

Also evaluate whether:

``` sql
FORCE ROW LEVEL SECURITY
```

is appropriate for relevant tables.

Ensure table owners/service-role operations remain intentionally
privileged.

------------------------------------------------------------------------

# 34. CSP

Current state:

``` text
ENABLE_CSP=0
```

CSP is implemented but not enabled.

Required process:

1.  Enable in staging.
2.  Run all major flows.
3.  Capture violations.
4.  Fix required source/resource policies.
5.  Avoid unnecessarily broad CSP.
6.  Ensure sandboxed template runtime remains compatible.
7.  Enable for production.

Do not blindly allow:

``` text
*
unsafe-eval
unsafe-inline
```

unless a specific, documented requirement exists.

------------------------------------------------------------------------

# 35. FABRICATED DATA THAT MUST BE REMOVED

The following currently contains fake/demo values and must not be
presented as real production information.

## Public Hero

Fake social proof such as:

``` text
Trusted for 5,00,000+ happy couples
```

Remove or replace with verified database data.

## Admin Dashboard

Remove hardcoded:

-   user locations
-   percentage changes
-   utilization
-   revenue changes
-   static sparklines

Use actual queries.

## Enhanced Dashboard

Remove fake technical metrics such as:

-   Ledger & Node v4.12
-   PostgreSQL aggregates cached: 42ms
-   fake checksum
-   fake verification status

## Invitation Runtime

Remove:

-   random visit calculations
-   hardcoded guest counts

Use actual analytics data.

## Email delivery UI

Remove fabricated:

-   200 OK
-   Delivered
-   0 bounce
-   MIME type
-   Amazon SES claims

The actual email provider is Resend.

Client should not claim delivery unless backed by actual provider state.

## Pricing

Current hardcoded pricing:

``` text
₹2,499
₹3,999
₹5,499
```

must come from the actual product/site-settings system if those values
are intended to be production pricing.

## Template Categories

Public template filters must use database categories rather than a
duplicate hardcoded list.

------------------------------------------------------------------------

# 36. FALLBACK/MOCK DATA

There are development mock fallbacks for:

-   dashboard
-   templates
-   categories
-   users

These must not silently appear as production data.

Use an explicit development-only flag if needed:

``` text
ADMIN_UI_PREVIEW
```

Do not let production silently fall back to fake records.

------------------------------------------------------------------------

# 37. CURRENT ADMIN GAPS

Admin currently needs completion in these areas.

## Templates

Need:

-   delete/archive behavior
-   name editor
-   description editor
-   category multi-select
-   search
-   category filter
-   status filter
-   created-date filter
-   sorting
-   version history
-   rollback/migration visibility
-   Used Today metric if required by the UI/spec

Do not physically delete versions referenced by live invitations.

## Users

Need:

-   Templates Used
-   Revenue
-   Last Seen/Last Active data
-   created date filter
-   templates-used filter
-   status filter
-   last-active range filter
-   sorting
-   delete/deactivate behavior as appropriate

Do not delete accounts destructively without checking related data and
retention rules.

## Bulk actions

Implement only where the operation is safe and well-defined.

Potential actions:

-   archive
-   status update
-   category assignment
-   delete/deactivate where safe

Require confirmation for destructive operations.

## Dashboard date filters

Current date-range controls are cosmetic.

They must actually change queries.

Potential ranges:

-   today
-   week
-   month
-   year
-   custom

------------------------------------------------------------------------

# 38. ADMIN SITE SETTINGS

A configurable Site Settings screen is currently missing.

Existing database has site settings.

Admin settings should be database-driven where appropriate.

Potential settings:

-   public marketing content
-   contact information
-   pricing display
-   support information
-   social links
-   feature flags
-   platform configuration

Do not expose secrets through site settings.

------------------------------------------------------------------------

# 39. GUEST BUILDER GAPS

Current builder is incomplete.

Required:

## Location picker

Database has:

-   latitude
-   longitude
-   maps URL

UI must actually populate them.

Support:

-   location name
-   address
-   maps URL
-   latitude
-   longitude

Do not require a third-party map API unless configured.

## Events step

Implement:

-   add event
-   edit event
-   delete event
-   reorder event
-   event name
-   date
-   time
-   location
-   address
-   maps URL
-   description

Use `wedding_events`.

## Guest list

Database exists.

Add UI/routes for:

-   guest name
-   phone
-   email
-   invitation status
-   RSVP status
-   guest count if applicable

------------------------------------------------------------------------

# 40. BUILDER DATA FIELDS

Current missing/partial fields include:

-   bride bio
-   groom bio
-   couple story

Add them to the correct builder step if the current schema supports
them.

Do not create duplicate fields if existing database columns already
support them.

------------------------------------------------------------------------

# 41. IMAGE OPTIMIZATION

Current image pipeline is basic.

Required production pipeline:

``` text
Upload
↓
Validate
↓
Read actual file signature
↓
Resize/compress
↓
Generate WebP/appropriate variants
↓
Store optimized media
↓
Return controlled URL
```

Potential variants:

``` text
480
768
1080
1440
```

Do not generate unnecessary sizes.

Do not destroy the original if business requirements need it.

Use CDN delivery.

------------------------------------------------------------------------

# 42. EMAIL & SHARING GAPS

## Resend button

Current SuccessContent has a no-op resend handler.

Wire it to:

``` text
/api/weddings/[id]/resend-email
```

with:

-   auth
-   ownership
-   published-state check
-   rate limit
-   error handling
-   success state

## QR code

Current QR area is only a visual block.

Generate an actual QR code pointing to the invitation URL.

## Email status

Only display statuses supported by actual provider/application records.

Do not claim delivery from the browser.

------------------------------------------------------------------------

# 43. CUSTOMER ACCOUNT GAPS

Complete:

-   expired invitation section where required
-   RSVP toggle error handling
-   RSVP export
-   analytics page
-   QR code
-   invitation sharing
-   email resend
-   "Test Guest Experience" button

The existing analytics API must be connected to actual customer UI.

Do not leave working APIs unused.

Console navigation (mobile and desktop):

-   The account section is labelled Settings. Brand details and Planner plan
    are section tabs on the Settings page, not top-level navigation items.
-   On phones the Settings tabs share one row (`flex-1`) so Profile, Brand
    details and Planner plan do not wrap.
-   The mobile top bar shows the full Invite Lime lockup (monogram + wordmark),
    not the monogram alone.
-   Edit content on an invitation opens `/app/invitations/[id]/edit`.
-   Download QR card builds a 1080×1350 PNG client-side (couple, date, venue
    and a scannable code) and downloads it; it is not a placeholder action.

------------------------------------------------------------------------

# 44. CUSTOMER ANALYTICS

Customer analytics should use real data.

Potential metrics:

-   total views
-   unique views if actually tracked
-   RSVP count
-   attending
-   declined
-   pending
-   recent activity
-   RSVP trend

Do not invent metrics.

If a metric is unavailable, either implement the underlying tracking or
omit the metric.

------------------------------------------------------------------------

# 45. PUBLIC WEBSITE

Existing public routes include:

``` text
/
 /templates
 /templates/[slug]
 /templates/[slug]/demo
 /live-demos
 /how-it-works
 /pricing
 /about
 /contact
 /faq
 /privacy
 /terms
```

Maintain the existing UI.

Make public content database-driven where the project already has data
models.

Do not fake testimonials, reviews, statistics, or performance claims.

------------------------------------------------------------------------

# 46. SEO

Current report identifies missing SEO infrastructure.

Consider implementing:

-   `sitemap.xml`
-   `robots.txt`
-   metadata
-   Open Graph
-   Twitter/social metadata where appropriate
-   structured data where accurate

Do not invent organization data, ratings, review counts, or business
claims.

Published invitations should have appropriate social metadata without
exposing private information.

------------------------------------------------------------------------

# 47. INVITATION RUNTIME

Public route:

``` text
/w/[slug]
```

Runtime flow:

``` text
slug
 ↓
wedding record
 ↓
published state check
 ↓
expiration check
 ↓
template ID
 ↓
pinned template version
 ↓
template package
 ↓
wedding JSON
 ↓
customer media
 ↓
music
 ↓
sandbox runtime
 ↓
personalized invitation
```

Published invitation must remain on its pinned version.

------------------------------------------------------------------------

# 48. EXPIRATION

Existing rule:

``` text
expiration = wedding date + 2 calendar months
```

Current implementation calculates server-side with month-end clamping.

Preserve this behavior.

Test:

-   normal month
-   28/29 February
-   month-end
-   wedding date changes
-   already expired invitation
-   timezone behavior

Do not calculate expiration only in the browser.

------------------------------------------------------------------------

# 49. PAYMENT ARCHITECTURE

Existing core payment flow is strong.

Current principles:

-   server-side product price resolution
-   browser does not control amount
-   Razorpay order creation
-   payment signature verification
-   server-side payment/order reconciliation
-   idempotent publishing
-   webhook handling

Preserve these principles.

Never trust client-submitted:

``` text
amount
price
product price
payment status
```

------------------------------------------------------------------------

# 50. GUEST CREATION FLOW

Canonical:

``` text
/create/new
    |
    v
Template selection
    |
    v
/create/[token]
    |
    v
Couple
    |
    v
Wedding
    |
    v
Events
    |
    v
Media
    |
    v
Review
    |
    v
Checkout
    |
    v
Payment
    |
    v
Account linking
    |
    v
Published invitation
```

The builder now has three steps, matched by `buildStepper` and
`BuilderHost`: **Invitation details** (couple, when & where, guest
settings, photos & music on one page) → **Preview** → **Preview &
Publish**.

------------------------------------------------------------------------

# 51. GUEST SESSIONS

Current architecture:

-   no forced login
-   random session token
-   HttpOnly cookie
-   guest draft
-   14-day expiry
-   autosave
-   rate limiting

Protect tokens as credentials.

Do not expose access tokens to authenticated users unnecessarily.

------------------------------------------------------------------------

# 52. INVITATION URL

Published URLs:

``` text
/w/[slug]
```

Must remain stable when editing.

Validate:

-   uniqueness
-   reserved routes
-   length
-   normalization
-   safe characters

Do not conflict with:

``` text
/admin
/app
/api
/templates
/create
/login
/register
/about
/contact
/pricing
```

------------------------------------------------------------------------

# 53. RSVP

Rules:

-   optional
-   enable/disable
-   deadline
-   public submission
-   rate limiting
-   duplicate handling
-   customer management
-   analytics

When disabled:

``` text
hide RSVP
```

When deadline passed:

``` text
reject new submissions
```

Do not display an RSVP form that the API will reject because the UI is
using stale/hardcoded state.

------------------------------------------------------------------------

# 54. MUSIC

Music is admin controlled.

Customer selects an approved track.

Concept:

``` json
{
  "enabled": true,
  "trackId": "music-001"
}
```

Runtime resolves track ID.

Customer does not copy template music into wedding media.

------------------------------------------------------------------------

# 55. CUSTOMER MEDIA PRIORITY

For bride/groom visuals:

``` text
1. customer uploaded photo
2. template animated pose
3. hide visual
```

Never show a broken image.

------------------------------------------------------------------------

# 56. CUSTOMER SHARING

Support:

-   copy link
-   native Web Share API
-   WhatsApp share URL where appropriate
-   email
-   Telegram where appropriate
-   QR code

Do not claim a message was sent if the application only opened a share
URL.

------------------------------------------------------------------------

# 57. EMAIL SYSTEM

Existing Resend integration.

Minimum important email types:

-   invitation published
-   contact form
-   invitation resend
-   account/access email where supported

Email sending must be server-side.

Email failure must not corrupt a successful invitation publication.

Provide retry/resend where appropriate.

------------------------------------------------------------------------

# 58. ERROR HANDLING

Every important operation needs:

``` text
loading
success
empty
error
retry
```

Do not expose stack traces to users.

Log technical details server-side.

Use consistent API error structures.

------------------------------------------------------------------------

# 59. STRUCTURED LOGGING

Current platform lacks a proper logging abstraction.

Introduce a small structured server-side logging abstraction.

Useful event categories:

``` text
AUTH
ADMIN
TEMPLATE
UPLOAD
PAYMENT
WEBHOOK
PUBLISH
EMAIL
RSVP
ANALYTICS
CRON
SECURITY
```

Log:

-   event
-   timestamp
-   request/correlation ID where possible
-   relevant record IDs
-   safe metadata
-   severity

Never log secrets.

------------------------------------------------------------------------

# 60. ERROR MONITORING

Introduce an error-monitoring abstraction without tightly coupling the
entire application to a single provider.

At minimum support:

``` text
captureException(error, context)
captureMessage(message, context)
```

Production provider can be connected later.

Do not silently swallow important errors.

------------------------------------------------------------------------

# 61. CRON

Existing:

``` text
/api/cron/maintenance
```

requires `CRON_SECRET`.

It should handle relevant maintenance such as:

-   expired guest sessions
-   stale drafts
-   invitation expiration
-   stale temporary data
-   cleanup tasks

A scheduler still needs to be configured for production.

------------------------------------------------------------------------

# 62. DATABASE MIGRATION RULES

Never rewrite an already-applied migration.

Use a new migration for changes.

Before production:

``` text
supabase db reset
```

must work cleanly in a fresh environment.

Seed must be idempotent.

Verify seed data does not duplicate or fail on rerun.

------------------------------------------------------------------------

# 63. TESTING STRATEGY

Current testing is insufficient.

Current:

-   35 unit tests
-   30 pass
-   5 fail
-   pure-function coverage
-   no API integration suite
-   no DB integration suite
-   no component coverage
-   no E2E

Required test layers:

``` text
Unit
↓
Database / RPC
↓
API integration
↓
Component
↓
E2E
```

------------------------------------------------------------------------

# 64. CURRENT FAILING TESTS

Known failures:

1.  template validator path traversal test is invalid because the ZIP
    construction normalizes the path
2.  template validator entry-point assertion is stale
3.  forbidden `.sh` assertion is stale
4.  payment timestamped webhook test fails because webhook
    implementation is wrong
5.  RSVP schema string guest count contract has drifted

Fix the tests AND underlying code/contracts appropriately.

Do not simply change assertions to make tests green without verifying
intended behavior.

------------------------------------------------------------------------

# 65. CRITICAL INTEGRATION TESTS

Add tests for:

-   RSVP submission
-   duplicate RSVP
-   guest media delivery
-   Razorpay webhook signature
-   webhook duplicate delivery
-   payment amount reconciliation
-   admin 401
-   customer 403
-   admin 200
-   guest draft autosave
-   template upload validation
-   template version publishing
-   invitation version pinning
-   invitation expiration
-   email dedupe
-   upload authorization
-   RLS boundaries

------------------------------------------------------------------------

# 66. E2E GUEST FLOW

Must eventually verify:

``` text
1. Open public site
2. Browse templates
3. Open template demo
4. Start guest invitation
5. Select template
6. Enter bride
7. Enter groom
8. Add event
9. Add location
10. Upload photo
11. Select music
12. Configure RSVP
13. Review
14. Checkout
15. Razorpay payment
16. Server verification
17. Publication
18. Email
19. Account linking
20. Open invitation
21. Verify media
22. Verify RSVP
23. Edit invitation
24. Verify same URL
25. Verify expiration behavior
```

------------------------------------------------------------------------

# 67. E2E ADMIN FLOW

Must eventually verify:

``` text
1. Admin login
2. Dashboard
3. Date filtering
4. User search
5. User filtering
6. User sorting
7. Template list
8. Template search
9. Template category filter
10. Template status filter
11. Upload ZIP
12. Validation
13. Preview
14. Save draft
15. Publish
16. Version creation
17. Version history
18. Category management
19. User management
20. Bulk action
21. CSV export
22. Site settings
23. Audit visibility
```

------------------------------------------------------------------------

# 68. PRODUCTION ENVIRONMENT

Expected environment categories:

``` text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL

B2_ENDPOINT
B2_REGION
B2_BUCKET_NAME
B2_WEDDINGS_BUCKET
B2_KEY_ID
B2_APPLICATION_KEY

NEXT_PUBLIC_RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET

EMAIL_API_KEY
EMAIL_FROM
EMAIL_FROM_NAME

NEXT_PUBLIC_APP_URL
CRON_SECRET

ENABLE_CSP
```

Never commit real credentials.

Never print secrets.

`.env.example` must contain placeholders only.

------------------------------------------------------------------------

# 69. REAL ENVIRONMENT VERIFICATION

Current report says all environment values are placeholders and the
application has never been verified against real:

-   Supabase
-   Razorpay
-   Resend

Therefore a final production gate must include:

1.  Create/use real staging Supabase.
2.  Apply migrations.
3.  Run seed.
4.  Configure storage.
5.  Configure Supabase Auth.
6.  Configure Razorpay test credentials.
7.  Configure Razorpay webhook.
8.  Configure Resend test sender/domain.
9.  Configure application URL.
10. Configure cron scheduler.
11. Enable CSP in staging.
12. Run complete E2E.
13. Fix all real integration failures.
14. Only then configure production credentials.

Never claim production readiness before this gate.

------------------------------------------------------------------------

# 70. UI PRINCIPLES

The existing Stitch UI is the visual source of truth.

Preserve it.

The product should feel like:

``` text
Luxury wedding editorial
+
modern technology platform
+
professional design studio
+
trusted consumer product
```

Platform UI should feel calm and trustworthy.

Invitation runtime should feel emotional and cinematic.

Do not turn the platform into a generic SaaS dashboard.

------------------------------------------------------------------------

# 71. NO VISUAL OVER-REDESIGN

Avoid unnecessary:

-   glassmorphism
-   excessive gradients
-   excessive pills
-   excessive rounded cards
-   fake luxury gold
-   blue SaaS appearance
-   excessive shadows
-   noisy animations

Use whitespace and hierarchy.

Do not redesign existing Stitch pages unless required to implement
missing functionality.

------------------------------------------------------------------------

# 72. PUBLIC WEBSITE CONTENT PRINCIPLES

Do not fabricate:

-   number of couples
-   reviews
-   ratings
-   performance
-   infrastructure claims
-   testimonials
-   security certifications
-   delivery percentages

Use real database values or remove the claim.

------------------------------------------------------------------------

# 73. CUSTOMER EXPERIENCE PRINCIPLE

The intended customer sequence:

``` text
Beautiful
↓
Professional
↓
Trustworthy
↓
Explore
↓
Easy to create
↓
Preview
↓
Feels like my wedding
↓
Publish
↓
Share
```

Do not add unnecessary friction.

------------------------------------------------------------------------

# 74. ADMIN EXPERIENCE PRINCIPLE

Admin should be able to manage the entire platform without developer
intervention.

Especially:

``` text
Categories
Templates
Template versions
Template metadata
Template publishing
Users
Orders
Invitations
Media
FAQs/settings where supported
Exports
```

A new template should be manageable entirely from the Admin Panel.

------------------------------------------------------------------------

# 75. TEMPLATE FORM REQUIREMENT

The Admin Template form must reflect the actual template architecture.

It should collect platform metadata rather than attempting to recreate
template HTML.

Expected metadata:

``` text
Template name
Slug
Description
Category / Categories
Thumbnail
ZIP package
Status
Version
Feature capabilities
```

The ZIP provides:

``` text
index.html
manifest.json
assets/
```

The admin form must not ask the admin to manually enter every wedding
field supported by the template.

Those fields belong to the standardized customer data contract.

The manifest tells the platform which optional capabilities the template
supports.

------------------------------------------------------------------------

# 76. TEMPLATE CATEGORIES

Templates can belong to multiple categories.

Do not use a raw comma-separated category ID field as the final
production UI.

Use a multi-select backed by the categories table.

Examples may include:

-   Muslim Wedding
-   Hindu Wedding
-   Christian Wedding
-   Minimal
-   Luxury
-   Cinematic
-   Traditional
-   Modern

Only use categories actually present in the database.

------------------------------------------------------------------------

# 77. TEMPLATE FEATURE CAPABILITIES

Feature flags describe what the template can render.

Potential capabilities:

``` text
couple
families
events
gallery
countdown
music
video
dress
rsvp
story
```

Only mark a capability true if the template actually supports it.

Do not use feature flags as a substitute for runtime validation.

------------------------------------------------------------------------

# 78. TEMPLATE PREVIEW DATA

Admin preview should use a complete demo wedding payload covering as
many supported features as possible.

Demo data must be explicitly demo data.

It must never be mistaken for real customer information.

------------------------------------------------------------------------

# 79. TEMPLATE VERSION LIFECYCLE

Recommended:

``` text
Uploaded
↓
Validated
↓
Draft
↓
Reviewed
↓
Published
↓
Archived
```

Published versions are immutable.

Archive does not destroy assets required by existing invitations.

------------------------------------------------------------------------

# 80. TEMPLATE REGISTRY

The application should discover templates from database/storage records.

Do not hardcode:

``` text
templateA
templateB
templateC
```

in application source.

A template uploaded by admin must automatically appear in the correct
marketplace/category after publishing.

------------------------------------------------------------------------

# 81. TEMPLATE MARKETPLACE

Public marketplace should be database-driven.

Template cards:

-   thumbnail
-   name
-   category
-   description
-   preview
-   select/use action

Use actual template data.

Do not show fake ratings unless a real rating system exists.

Browsing surfaces (`/templates`, `/app/explore`, `/app/favorites`,
`/create/browse`, `/live-demos`) share the same behaviour:

-   Search filters on template name, description and category.
-   Category chips are keyed by slug but template categories are display
    names, so matching must slugify before comparing. `ExploreGrid` used to
    compare raw names to slugs, which emptied the grid for every filter;
    `src/components/account/explore-filter.ts` owns the fix and its tests.
-   Category badges sit on a solid background (never transparent) so they
    stay readable over photography.
-   Results are revealed six at a time on scroll via
    `useInfiniteReveal` + `InfiniteScrollFooter`, with a spinner at the
    bottom while the next page loads. Filtering or searching resets to page
    one.
-   The saved heart on template details is filled red when saved.

Account and admin mobile bottom bars show the active tab with primary
colour, a top underline, a filled icon and `aria-current="page"`.

------------------------------------------------------------------------

# 82. CUSTOMER DATA OWNERSHIP

Customer A must never access Customer B's:

-   wedding
-   draft
-   photos
-   videos
-   RSVP data
-   order information
-   analytics
-   guest list

Test cross-user access explicitly.

------------------------------------------------------------------------

# 83. PUBLIC DATA BOUNDARY

Published invitations can expose only intentionally public invitation
information.

Private fields must not be included in the runtime payload.

The runtime payload should contain only what the invitation needs.

------------------------------------------------------------------------

# 84. INVITATION EXPIRATION UI

If expired:

-   do not render the active invitation as if it is live
-   show a controlled expiration page/state
-   do not show active RSVP
-   do not send active-invitation claims in email
-   preserve customer access to historical information where appropriate

------------------------------------------------------------------------

# 85. API DESIGN PRINCIPLES

Existing API routes should be reused.

Important existing routes include:

``` text
/api/guest/start
/api/guest/draft
/api/guest/session
/api/orders
/api/payments/razorpay/verify
/api/payments/webhook
/api/rsvp
/api/weddings/[id]
/api/weddings/[id]/rsvp-toggle
/api/weddings/[id]/resend-email
/api/uploads
/api/assets/[...file]
/api/admin/*
/api/contact
/api/cron/maintenance
/api/auth/callback
```

Do not create duplicate endpoints for existing responsibilities.

------------------------------------------------------------------------

# 86. API VALIDATION

Use the project's existing Zod validation architecture.

Validate:

-   body
-   query parameters
-   route parameters
-   uploaded files
-   enum values
-   lengths
-   numeric ranges
-   IDs
-   dates
-   URLs

Never trust client payload structure.

------------------------------------------------------------------------

# 87. API ERROR CONTRACT

API errors should be consistent.

Conceptual structure:

``` json
{
  "error": {
    "code": "SOME_STABLE_CODE",
    "message": "Safe user-facing message"
  }
}
```

Do not expose:

-   stack traces
-   SQL errors
-   secrets
-   internal file paths

Log internal details server-side.

------------------------------------------------------------------------

# 88. PERFORMANCE

Prioritize:

-   CDN
-   immutable template caching
-   lazy loading
-   responsive image variants
-   efficient queries
-   pagination
-   proper database indexes
-   template asset caching
-   large video streaming/CDN

Do not load all templates or all media on initial page load.

------------------------------------------------------------------------

# 89. MOBILE

Published invitations are mobile-first.

Test:

``` text
360
390
414
480
```

Then:

``` text
768
1024
1280
1440
1920
```

The cinematic design must remain intact.

Do not remove animation simply to simplify implementation.

Respect `prefers-reduced-motion`.

------------------------------------------------------------------------

# 90. ACCESSIBILITY

Verify:

-   semantic HTML
-   labels
-   keyboard navigation
-   visible focus
-   dialogs
-   errors
-   alt text
-   button/link semantics
-   contrast
-   reduced motion

------------------------------------------------------------------------

# 91. KNOWN SMALL BUGS

Known from the latest report:

-   Toast class typo: `bg-surfac/90`
-   password visibility toggle not wired
-   Explore "Test Guest Experience" button dead
-   Template Showcase empty state links to non-existent `/preview-demo`
-   fallback InvitationRuntime hardcodes RSVP enabled
-   fallback InvitationRuntime has fake/random visit numbers
-   fallback InvitationRuntime has hardcoded guest count
-   SuccessContent resend button has no handler
-   SuccessContent email delivery block is fabricated
-   QR code is not real
-   ManageInvitation RSVP toggle ignores response status
-   "Edit content" button is disabled
-   QR and RSVP export handlers missing
-   analytics API is not connected to UI
-   Cmd/Ctrl+K hint has no keyboard behavior

Fix these during the polish/dead-UI pass.

------------------------------------------------------------------------

# 92. CURRENT PROJECT STRUCTURE PRINCIPLE

The actual repository structure must be discovered from the current
repository.

Do not invent directories.

Conceptually the application contains:

``` text
app/
├── public routes
├── auth routes
├── customer routes
├── admin routes
├── invitation runtime
└── api routes

src/
├── components/
├── lib/
├── services/
├── validators/
├── runtime/
└── other application modules

supabase/
├── migrations/
├── seed.sql
└── configuration/tests as they are added

scripts/
└── operational scripts
```

The repository itself is the authoritative source for exact paths.

------------------------------------------------------------------------

# 93. DATABASE CHANGE RULE

If a feature requires a database change:

1.  inspect current schema
2.  create a new migration
3.  add constraints/indexes/policies
4.  test migration
5.  test RLS
6.  test rollback/recovery strategy where applicable
7.  update seed if needed
8.  update types if generated
9.  update tests

Never edit already-applied migration history casually.

------------------------------------------------------------------------

# 94. SEED DATA

Seed currently contains:

-   12 categories
-   7 products
-   7 templates
-   category relationships
-   site settings
-   FAQ data

Seed must become idempotent.

Running seed twice should not create duplicate production records or
fail unnecessarily.

------------------------------------------------------------------------

# 95. ADMIN PREVIEW MODE

Development-only admin preview exists:

``` text
ADMIN_UI_PREVIEW=1
```

Purpose:

-   inspect admin UI
-   develop without real admin login

It must:

-   never operate in production
-   never bypass `/api/admin/*`
-   never expose data
-   clearly display preview mode

Before production, disable or remove it.

------------------------------------------------------------------------

# 96. FINAL PRIORITY ORDER

Work in this exact order unless a verified dependency requires
otherwise.

## P0: Real usage blockers

1.  RSVP upsert
2.  guest media delivery
3.  Razorpay webhook verification
4.  privilege escalation trigger
5.  invalid time-dependent partial indexes

## P1: Security

6.  PUBLIC function grants
7.  rate-limit identity
8.  guest session exposure
9.  email dedupe
10. guest draft autosave
11. RLS hardening
12. CSP staging verification

## P2: Honesty and broken UI

13. remove fabricated data
14. remove mock production fallbacks
15. fix dead buttons
16. fix RSVP fallback runtime
17. fix Toast
18. fix password visibility
19. implement QR
20. implement resend
21. connect analytics

## P3: Product completeness

22. Admin template CRUD improvements
23. multi-category templates
24. template filters
25. version history
26. user filters/sorting
27. bulk actions
28. dashboard date queries
29. Site Settings
30. location picker
31. events UI
32. guest list
33. customer analytics
34. RSVP export
35. expired invitation section
36. sharing improvements

## P4: Quality gate

37. fix all unit tests
38. database/RPC tests
39. API integration tests
40. security tests
41. E2E guest flow
42. E2E admin flow
43. structured logging
44. error monitoring abstraction
45. SEO
46. CI
47. real staging deployment
48. real provider verification
49. production deployment checklist

------------------------------------------------------------------------

# 97. DEFINITION OF DONE

Do not call Invite Lime complete until:

## Build

``` text
npm run build
```

passes.

## Types

``` text
npm run typecheck
```

passes.

## Lint

No unexplained production lint errors.

## Tests

All intended tests pass.

## Database

Clean database provisioning works.

## RLS

Cross-user access is denied.

## Payments

Real test-mode Razorpay flow works.

## Webhooks

Valid webhook accepted.

Invalid webhook rejected.

Replay handled.

## Email

Real Resend delivery works.

Dedupe works.

Resend works.

## Storage

Customer images actually render in published invitations.

Private files remain protected.

## Templates

Admin can:

``` text
upload
validate
preview
draft
publish
version
archive
```

## Customer

Customer can:

``` text
select template
enter data
add events
add location
upload photos
select music
configure RSVP
preview
pay
publish
edit
share
```

## Guest

Guest can:

``` text
open invitation
see correct design
see correct photos
see events
use RSVP
```

## Versioning

Old invitation remains on old template version.

## Expiration

Server-side expiration works.

## Security

No private credentials or customer data leak to template runtime.

## Honesty

No fake production metrics or fabricated delivery states.

------------------------------------------------------------------------

# 98. AI RESPONSE / IMPLEMENTATION BEHAVIOR

When an AI agent works on this project:

### Before coding

State briefly:

-   what was inspected
-   what issue was found
-   what files/migrations are relevant
-   what will be changed

### During coding

Do not rewrite unrelated code.

### After coding

Report:

``` text
Changed
Tested
Remaining
```

Use actual results.

Do not say "complete" if something was not verified.

------------------------------------------------------------------------

# 99. DO NOT MAKE THESE ARCHITECTURAL MISTAKES

Never:

-   build a React app per template
-   deploy one application per customer
-   duplicate customer media into templates
-   embed customer data into template files
-   let templates query Supabase
-   expose service-role keys
-   trust frontend payment amounts
-   trust frontend roles
-   use fake analytics
-   use hardcoded production metrics
-   silently migrate template versions
-   delete referenced template versions
-   use client-only authorization
-   use public URLs for private media
-   create duplicate API routes
-   create duplicate JSON schemas
-   bypass RLS
-   turn off security to make tests pass

------------------------------------------------------------------------

# 100. FINAL ARCHITECTURAL MODEL

The final Invite Lime system is:

``` text
                    INVITE LIME PLATFORM
                           |
          +----------------+----------------+
          |                |                |
       ADMIN            CUSTOMER          GUEST
          |                |                |
          v                v                v
   Template Manager   Invitation Builder  Published URL
          |                |                |
          v                v                v
    Template ZIP       Wedding Data       Runtime
          |                |                |
          v                v                |
   Validation          Customer Media      |
          |                |                |
          v                +-------+--------+
   Immutable Version              |
          |                        v
          +--------------> Sandbox Template
                                   |
                                   v
                          Personalized Wedding
                                   |
                          +--------+--------+
                          |                 |
                         RSVP             Analytics
```

Core rule:

``` text
ONE PLATFORM
ONE DATABASE
ONE STANDARD DATA CONTRACT
MANY TEMPLATES
MANY VERSIONS
MANY CUSTOMERS
MANY INVITATIONS
```

------------------------------------------------------------------------

# 101. CURRENT PROJECT STATUS SNAPSHOT

As of the latest verified report:

### Strong / substantially implemented

-   database architecture
-   RLS foundation
-   authentication
-   template runtime
-   template sandbox
-   immutable versions
-   payment core
-   publishing
-   expiration
-   guest sessions
-   customer console
-   template ZIP validator
-   provider-independent storage abstraction (Supabase Storage default,
    Backblaze B2 opt-in)
-   public routes
-   basic admin
-   basic email
-   RSVP architecture
-   analytics data model

### Broken / blocking

-   RSVP submissions
-   guest uploaded photo delivery (needs live-storage verification)
-   Razorpay webhook verification
-   service-role admin promotion
-   clean DB provisioning
-   live Backblaze B2 verification (no B2 credentials configured)

### Security gaps

-   public function execution
-   spoofable rate-limit identity
-   guest session exposure
-   email dedupe
-   draft autosave
-   RLS hardening
-   CSP disabled

### Missing product functionality

-   advanced admin management
-   template multi-category UI
-   filters/sorting/bulk actions
-   template version history UI
-   real dashboard filters
-   location picker
-   events builder
-   guest list UI
-   customer analytics UI
-   RSVP export
-   real QR
-   working resend UI
-   SEO infrastructure
-   structured logging
-   monitoring
-   CI
-   production provider verification

------------------------------------------------------------------------

# 102. SOURCE OF TRUTH ORDER

When information conflicts, use this priority:

``` text
1. Current repository source code
2. Current database migrations/schema
3. Current tests
4. This Invite Lime AI Project Context
5. Older documentation
6. Generic assumptions
```

If this file conflicts with actual current code, inspect the repository
and update this file rather than blindly following stale information.

If a requirement is ambiguous, inspect existing implementation and
preserve backward compatibility.

------------------------------------------------------------------------

# 103. MAINTENANCE OF THIS FILE

This file is a living project memory.

After major architectural changes, update:

-   current stack
-   database changes
-   routes
-   template contract
-   security model
-   production checklist
-   known issues
-   completed items
-   remaining items

Do not turn this file into a dump of temporary debugging notes.

Keep durable architectural decisions and verified project state here.

------------------------------------------------------------------------

# 104. FINAL AI INSTRUCTION

Before every substantial Invite Lime implementation task:

``` text
READ THIS FILE
        ↓
INSPECT THE REPOSITORY
        ↓
VERIFY CURRENT STATE
        ↓
IDENTIFY EXACT GAP
        ↓
PRESERVE EXISTING ARCHITECTURE
        ↓
IMPLEMENT MINIMAL CORRECT CHANGE
        ↓
TEST
        ↓
SECURITY CHECK
        ↓
REPORT ACTUAL RESULT
        ↓
UPDATE THIS FILE IF ARCHITECTURE CHANGED
```

**Do not treat this project as a greenfield application.**

**Do not rebuild working systems.**

**Do not invent functionality.**

**Do not fabricate data.**

**Do not weaken security to make the application appear complete.**

**Invite Lime must remain one scalable platform with independent,
immutable, sandboxed wedding invitation templates.**

------------------------------------------------------------------------

# 105. OBJECT STORAGE ABSTRACTION + BACKBLAZE B2

Implemented so the platform can run object storage on Supabase Storage
(default) or Backblaze B2 (opt-in) without touching application code.
Supabase remains the database and Auth provider; B2 never replaces
those.

## Layout

``` text
templates/{templateId}/v{version}/...   - template packages (immutable)
templates/{templateId}/thumbnail        - admin/marketplace thumb
weddings/{weddingGuid}/{role}/{file}    PRIVATE - customer media
```

Both B2 buckets stay PRIVATE. Browsers never hold B2 credentials:

``` text
templates -> B2_BUCKET_NAME      (private; served via signed /api/templates proxy)
weddings  -> B2_WEDDINGS_BUCKET  (private; only read through /api/media)
```

Template delivery with B2: `templateAssetBaseUrl(storagePrefix)` produces
`/api/templates/{exp}.{hmac}/{templateId}/v{n}/`, and `publicObjectUrl`
produces `/api/templates/{exp}.{hmac}/{templateId}/thumbnail`. The HMAC
signature (SHA-256 over `exp:{templateId}/v{n}`, keyed by
`SUPABASE_SERVICE_ROLE_KEY`) is short-lived and scoped to the immutable
version folder, so the runtime's `<base href>` (and every relative asset)
resolves onto the proxy while the signature is re-verified per request.
The server reads the entry HTML directly through `storage.download`
(no self-fetch through the proxy). Supabase mode keeps using the public
`templates` bucket URLs unchanged.

Template versions stay immutable on both backends (B2 uploads verify
existence before writing when `upsert` is false). One published template
version is shared by every invitation that pins it; nothing is copied
into a wedding's folder.

## Env vars (server only unless noted)

``` text
NEXT_PUBLIC_SUPABASE_URL      (unchanged; still used for DB/Auth/fallback URLs)
NEXT_PUBLIC_SUPABASE_ANON_KEY (unchanged)
SUPABASE_SERVICE_ROLE_KEY     (unchanged, server only; also keys template
                               /api/templates signing, so never rotate casually)
B2_ENDPOINT        e.g. https://s3.us-west-000.backblazeb2.com
B2_REGION          e.g. us-west-000
B2_BUCKET_NAME     private templates bucket
B2_WEDDINGS_BUCKET private weddings bucket
B2_KEY_ID          server only
B2_APPLICATION_KEY server only
```

B2 is active when `B2_ENDPOINT`, `B2_KEY_ID` and `B2_APPLICATION_KEY`
are all set; otherwise Supabase Storage is used.

## Contract (`src/lib/services/storage/...`)

``` text
ObjectStorage
  upload(bucket, key, body, { contentType, upsert, cacheControl })
  download(bucket, key)            -> { body: Buffer, contentType } | null
  delete(bucket, key)
  exists(bucket, key)
  move(bucket, from, to)           -> rejects 409 when destination occupied
  copy(bucket, from, to)
  list(bucket, prefix)
  signedUrl(bucket, key, seconds)
  publicUrl(bucket, key)           -> only valid for public templates area;
                                     with B2 it returns a signed proxy path
                                     (/api/templates/...), never a raw bucket URL
```

-   `getObjectStorage()` resolves the backend once per process and
    caches it; B2 providers use dynamic import so the AWS SDK never
    enters the client/test bundle.
-   `StorageError` carries an HTTP `status`; `isAlreadyExistsError()`
    normalizes the "already exists" condition across backends.
-   Backends: `supabase-storage.ts` (service-role) and `b2-storage.ts`
    (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, path-style
    endpoint).

## Rewired touchpoints

-   `saveWeddingMedia` (wedding upload) -> abstraction.upload(`weddings`)
-   `/api/media/[...path]` proxy -> abstraction.download(`weddings`)
-   `media-migration` relocation -> abstraction.move/delete(`weddings`)
-   admin template package + thumbnail upload -> abstraction.upload(`templates`)
-   `/api/templates/[...path]` proxy -> signed TSV + abstraction.download(`templates`)
-   public template/thumbnail/preview URLs -> `storage/urls.ts`
    (`publicObjectUrl`, `templatePackageBaseUrl`), env-driven; B2 returns
    signed `/api/templates` routes, Supabase returns public Storage URLs
-   template runtime base href -> `templateAssetBaseUrl(storagePrefix)`
    resolves through the active backend

## Verification status

Verified in this workspace and against the real Supabase project
(`xnfbvrleatkgmilwlswc`):

-   `npm run typecheck` passes
-   `npm test` (235 tests) passes, including storage URL/signature and
    template-lifecycle tests
-   migrations 00001-00006 + seed applied to the live Supabase project
-   live admin E2E: templates/tags CRUD, duplicate-slug 409 guard
-   live template DELETE E2E: B2 objects (6 under test template prefix)
    removed, versions + template row deleted, idempotent second call
    returns alreadyDeleted, admin list no longer shows the template
-   live guest media proxy checks for the `weddings` bucket

Not yet verified (requires real B2 credentials / environment):

-   live B2 round trips: template ZIP upload, extracted files, signed
    `/api/templates` index.html + asset loading, admin preview, customer
    render, private wedding media upload, authorized read, unauthorized
    rejection (both the signed-proxy and /api/media paths)
-   the full manual checklist in the 00002 engineering brief (admin
    auth, template create, ZIP validation, files in B2, metadata in
    Postgres, version creation, thumbnail/preview, published render,
    wedding creation, per-wedding media privacy, shared-template delete
    protection, no client-side secrets)

Do not claim production readiness until those are exercised against a
real staging environment.

------------------------------------------------------------------------

# 106. ADMIN TEMPLATE LIFECYCLE MANAGEMENT

Implemented end to end (admin UI + API + DB + storage + tests). This
extends the "recommended" version lifecycle in #79 with live
disable/enable and permanent deletion.

## Usage counts (DB-derived, not mock)

-   `src/lib/services/template-lifecycle.ts`
-   Active invitation count = wedding rows where
    `template_id = T OR template_version_id IN (versions of T)` AND
    `status = 'active'` AND (`expiration_date IS NULL OR >= today
    YYYY-MM-DD`). Deduplicated by wedding id.
-   Total invitation count = every wedding referencing the template by
    id or via one of its versions (active or not, expired included).
-   The admin templates page loads `weddings` in the same
    `Promise.all`, builds a usage map, and passes
    `activeInvitations`/`totalInvitations` to each row. The list row
    shows `"N active · M invitations total"`.

## Migration 00006

`supabase/migrations/00006_templates_lifecycle.sql` (idempotent):

-   `weddings.template_id` and `weddings.template_version_id` become
    nullable so a template can be detached from past invitations.
-   Partial indexes `weddings_template_id_idx` /
    `weddings_template_version_id_idx`.
-   Applied to the live Supabase project.

Downstream type effect: `weddings.Row`/`Update` now allow
`string | null` (Insert keeps them required). Any code that reads
a wedding must tolerate a null template reference (guard exists in
`template-runtime.ts` `loadInvitationRuntime`, `w/[slug]` falls back to
the built-in `InvitationRuntime`, success/accepted page types widened).

## Disable / re-enable

-   Marketplace (`guest/start`, demo/detail pages) already lists only
    `status = 'active'` templates.
-   New: `POST /api/orders` rejects a purchase when the template is not
    `status = 'active'` or has no product (400 "This template is no
    longer available for purchase") and when the pinned version is not
    the template's published version (400 "Template version mismatch").
-   Disabling does NOT break existing invitations: published weddings
    keep rendering and their signatures stay valid; buying/checking out
    a disabled template is blocked. Guest continue/checkout after the
    guest session flow is also validated against the current template
    status.
-   `TemplatesManager` only offers Enable on `disabled` and Disable on
    `active` rows (drafts cannot be toggled).

## Permanent delete — contract

`DELETE /api/admin/templates/[id]` (admin only, UUID, rate limited
`admin_destructive` 60/hour):

-   In-use guard: if any `activeInvitations > 0` (computed server-side,
    same definition as the UI), returns
    `409 { code: "TEMPLATE_IN_USE", activeInvitations, totalInvitations }`
    and performs no mutation.
-   Otherwise: detaches non-active weddings
    (`template_id`/`template_version_id` -> null), deletes
    `guest_drafts` for the template (by template_id OR version ids),
    deletes every object under `{templateId}/` **plus each version's
    `storage_prefix` and the explicit `thumbnail_path` /
    `preview_gif_path` keys** in the templates bucket (both backends),
    then deletes the template row (cascades to
    versions/categories/favorites). A Postgres `23503` is re-checked
    and surfaced as 409. Storage failure aborts with
    `500 { step: "storage" }` before the row delete (retry-safe).
-   Demo-library cleanup: the assigned media pack (photos + B2
    objects under `library/media/`), demo detail pack, music track
    (+ object under `library/music/`) and pricing product are deleted
    only when no other template references them. Shared resources are
    left intact. A product referenced by an order is kept. Failures in
    these steps abort before the template row with
    `500 { step: "media_pack" | "demo_details" | "music" }`, so the
    delete can be retried.
-   Idempotent: a missing template returns
    `200 { ok: true, alreadyDeleted: true }` with no error.
-   Success returns
    `{ ok: true, templateId, name, versionsDeleted, objectsDeleted, detachedWeddings, deletedDrafts, removedMediaPacks, removedDetailPacks, removedMusicTracks, removedProducts, warnings? }`
    and logs an `admin_actions` `template.delete` entry.
-   `orders`/`payments` have no FK to templates, so history survives
    deletion; `analytics_events` reference is SET NULL.

## S3 / storage cleanup

`storage.list(bucket, "{templateId}/")` + one list per declared
version `storage_prefix`, then per-key `delete`; explicit thumbnail
and preview keys are deleted even when they live outside the template
folder. Media-pack photos and music objects are deleted **before**
their catalogue rows, so a B2 failure leaves the rows available for a
retry instead of orphaning unreachable objects. Both backends treat a
missing key as a no-op, so re-running the handler is safe.

## Tests

-   `src/lib/services/template-lifecycle.test.ts` — active/expired/
    today boundaries, dedupe, template-vs-version matching, map builder,
    fetch path.
-   `src/app/api/admin/templates/[id]/route.test.ts` — auth 403, bad
    UUID 400, in-use 409 (with zero mutation), version-only refs,
    full success flow incl. drafts + B2 cleanup scope, exclusive demo
    photos/details/soundtrack/product removal, shared-resource
    retention, order-linked product retention, legacy version prefixes
    + external thumbnail/preview keys, demo-photo failure rollback,
    idempotent 200, expired-does-not-block, 23503 409, storage failure
    500, rate limit 429.
-   `src/app/api/orders/route.test.ts` — disabled-template 400,
    unpublished-version 400, enabled -> order created.
-   Suite verified live: `npm run typecheck` clean, `npm test` (all
    21 files / 235 tests) pass, `npm run build` passes, lint clean on
    the changed files.

## Add-template wizard (fixed)

`TemplatesManager` add wizard had two UX bugs, both fixed:

-   The last-step "Done" button was `type="submit"`, so clicking it
    re-ran `handleSubmit` (re-creating the template → duplicate-slug
    400) and never closed the wizard. It now renders as a plain button
    that calls `closeWizard()` only after a successful upload, and
    `closeWizard()` also clears `validationResult` (the validation
    popup) and the wizard state.
-   A freshly created template was never added to the local `rows`
    state, so it did not appear in the list until a page reload.
    `handleSubmit` now calls `appendTemplateRow()` (products/categories
    derived from wizard state; usage starts at 0 until refresh), and the
    created template id is kept in `createdTemplateId` so a retry after
    a rejected package re-uploads to the same template instead of
    colliding on the slug.

## Guest create flow — session/token fixes

Reported: "can't use the template to edit after choosing it as guest
mode to customize the template". Two DB functions, not the UI, were
silently breaking the entire guest journey:

-   `create_guest_session()` generated tokens with
    `gen_random_bytes(24)` (pgcrypto), but on managed Postgres the
    pgcrypto extension installs into the `extensions` schema while the
    function runs with `search_path = public` — every guest session
    start threw `function gen_random_bytes(integer) does not exist`,
    so `POST /api/guest/start` returned 500 and **no template could ever
    be opened in guest mode**. Root cause: pgcrypto *is* installed live,
    but in the `extensions` schema (off the function's `search_path`);
    fix: migration `00007_guest_session_token_uuid.sql` regenerates the
    token with `gen_random_uuid()` (built-in since PG13, schema-proof —
    64 hex chars, `access_token` is `text`, no length constraint).
    `00001_init.sql` updated to match for fresh installs.
-   `get_guest_draft()` mixed `jsonb_agg(...)` with `ORDER BY
    d.updated_at` / `LIMIT` and no `GROUP BY` — PostgreSQL rejected it
    (`column d.updated_at must appear in the GROUP BY clause`), so the
    builder page (`/create/[token]`) threw 500 right after a session
    started. Rewritten (same 00007) to select the single most-recent
    draft into a record and return the object directly. Output shape is
    unchanged (`GuestDraft`).

Verified live after applying 00007: `create_guest_session` returns a
token, `get_guest_draft` returns the draft, `POST /api/guest/start
{slug:"royal-mughal"}` returns 200 with `token`/`draftId`, and
`GET /create/<token>` renders `BuilderHost` with the template name
(HTTP 200).

Also fixed the template → studio handoff, previously dead:

-   `src/app/create/new` ignored `?template=<slug>` (used by the
    template detail + demo "Use this template" / "Customize this
    template" CTAs), so the chosen template was silently dropped. It now
    reads `searchParams.template` and passes it to `StartHost`, which
    auto-starts the guest session (`POST /api/guest/start`) for that
    slug and `router.replace`s into `/create/<token>` (loading state
    while starting; on failure it falls back to the two-choice launcher
    with the error shown; a ref guards against retry loops).
-   `src/app/create/browse` ignored `?template=<slug>` (used by the
    account `ExploreGrid` "Customize this template"). `TemplatePicker`
    now accepts `initialSlug` and preselects that template's card, so
    it is one click ("Customize selected template") from the studio.

Suite verified: typecheck clean, 236 tests pass, `npm run build`
passes, and both `/create/new?template=royal-mughal` and
`/create/browse?template=royal-mughal` render 200 on the dev server.

## Guest live preview before publishing

Guests can now see the actual invitation website — the same sandboxed
template runtime used by published invitations and demo mode — with
their own data, *before* they reach the pay step.

-   Preview step in the builder (current three-step flow: Invitation
    details → **Preview** → Preview & Publish, from `step-config.ts` +
    `BuilderHost`).
-   `src/app/api/guest/preview/route.ts` (`POST`): token-validated via
    `getGuestDraft` (401 expired / 400 template mismatch), rate-limited
    (`guest_preview`, 120/h), resolves the draft's immutable published
    version with `resolveRuntimeTemplate`, builds the payload with
    `buildGuestPreviewPayload`, and returns the fully bound sandbox
    document `{ html, payload }` (404 when the package isn't uploaded).
-   `src/lib/services/guest-preview.ts`: pure helper mapping the
    builder's `WeddingData` onto the runtime contract
    (`mode: "live"`, `rsvp.enabled: false`, provisional `invitation.url`
    = `/create/<token>`). Unit-tested (`guest-preview.test.ts`).
-   `src/components/builder/StepPreview.tsx`: debounced (500 ms) fetch
    of the bound document keyed on the in-memory data, rendered in
    `TemplateFrame`; loading/error(+retry) states; "Back — Photos &
    music" / "Continue — Preview & publish" actions. Data is sent
    `weddingDataForDb(...)`-sanitized, so validation stays lenient
    (`weddingDataSchema.partial()`).
-   Fixed a latent bug found along the way: the autosave schema
    (`weddingDataSchema`) stripped unknown keys, so `gallery`,
    `bridePhoto`/`groomPhoto`/`couplePhoto` and `music` were never
    persisted in guest drafts. Added those media fields (defined once as
    `mediaItemSchema`) to `weddingDataSchema` — media now auto-saves too.
-   Verified live: `POST /api/guest/preview` returned HTTP 200 with the
    bound HTML (127 KB) whose payload carried the submitted names/mode.
    Builder page 200, bogus token 404. Typecheck clean, 238 tests pass
    (22 files), build + eslint pass.

## Account editor media, browse flow and signed-in nav

Current behaviour after the latest UI pass:

-   The account editor (`/app/invitations/[id]/edit`) stores the full
    `WeddingData` shape and loads it through `normalizeWeddingData`, so
    nullable API fields (`mapsUrl`, `weddingTime`) never reach a
    controlled input as `null`.
-   It reuses `MediaFields` for portraits, gallery and soundtrack.
    Owner uploads pass `weddingId` (no guest token); the upload route
    already authorized the logged-in owner. `GET`/`PATCH
    /api/weddings/[id]` return and persist `gallery`, `bridePhoto`,
    `groomPhoto`, `couplePhoto` and `music`.
-   `/create/browse` has no select-then-continue step and no "Create
    new" button; clicking a card starts the guest session directly.
-   The public layout resolves the session once and passes `signedIn`
    plus a role-aware `dashboardHref` to `PublicNav`; signed-in visitors
    see "Dashboard" (admin → `/admin/dashboard`, customer/planner →
    `/app/invitations`) instead of "Sign in".
-   Account and admin desktop shells use `max-w-7xl` below 1536px and
    expand to full width at `2xl`, so large monitors do not keep empty
    side gutters. Explore card category badges and saved hearts use
    opaque white backgrounds.
-   My Invitations cards keep their three live stats on one row from
    `sm` upward and stack them as compact label/value rows on phones,
    so the cards stay short on small screens.
-   Planners can permanently delete an invitation they own, from either
    the My Invitations card or the detail-page quick actions. The shared
    `DeleteInvitationButton` requires the live slug (or id) to be typed,
    then calls `DELETE /api/weddings/[id]` with
    `{ confirm: "<slug-or-id>" }`. The route re-checks the `planner` role
    and `user_id` ownership, rate-limits per planner and runs
    `purgeWedding` (stored media + dependent rows; orders/payments keep
    history with `wedding_id` nulled). The list removes the card locally;
    the detail page returns to `/app/invitations`.
-   The shared `Modal` renders through a portal to `<body>` and is a
    centered card on phones with `1rem` (plus safe-area) space above and
    below, a scrollable body and a wrapping footer, so dialogs stay
    inside the mobile viewport even inside cards/tables. The invitation
    deletion dialog (planner and admin) labels its confirm action
    "Delete".

Verified after this pass: typecheck clean, focused ESLint clean, build
passes, and 62 test files / 662 tests pass.

# 107. MEDIA LIFECYCLE AND ORPHAN CLEANUP

Implemented so replacing or removing wedding media removes the superseded
Backblaze B2 object instead of leaving it orphaned forever. The same
reference-aware rules cover builder autosaves, the account editor, the
upload endpoint and admin media-pack replacement.

## Safety rule

An object is deleted only when no current state still points at it. The
checks, in order, are:

1. `weddings.wedding_data` for every wedding whose folder contains a
   candidate key (plus the explicitly scoped wedding).
2. every non-expired `guest_drafts` row for a session that owns a
   candidate (a published invitation's builder tab can still hold the
   same URLs), plus the exact draft being saved.
3. `wedding_media` rows for the scoped wedding.

Shared `library/` objects are always excluded — they belong to the
platform, not to one invitation. External URLs and malformed keys are
ignored. Query failures are fail-safe: nothing is deleted when the
database cannot answer, and the returned `failures` list lets a later
save retry. Object-delete failures also leave the recorded row in place
so the next attempt can find it again.

## Authority

`src/lib/services/media-upload-scope.ts` is shared by both media
endpoints:

- `POST /api/uploads` writes the object,
- `POST /api/uploads/cleanup` removes a superseded one.

A request is authorized as a guest (opaque token from the cookie or a
non-JWT bearer value) or as a logged-in owner. A wedding-folder key is
allowed only for that wedding; a draft-folder key is allowed only when
`guestFolderMatches` derives it from the caller's token. Uploading or
cleaning another session's or another wedding's media is refused before
any reference query runs. The cleanup endpoint is rate-limited
(`media_cleanup`, 300/hour).

## Cleanup service

`src/lib/services/media-cleanup.ts` exposes:

- `normalizeMediaCleanupKeys(values)` — accepts `/api/media/...` URLs
  (absolute or relative) and plain `folder/role/file` keys, drops
  `library/`, external and malformed values, de-duplicates, and caps a
  single call at `MAX_MEDIA_CLEANUP_KEYS` (200).
- `isMediaCleanupAllowed(key, { weddingId, guestToken })` — the
  folder/role authorization rule above.
- `deleteUnreferencedMediaKeys(values, request)` — normalizes, loads
  references, deletes unreferenced objects, and then deletes the
  matching stale `wedding_media` rows.

Options: `weddingId`, `guestSessionId`, `draftId`,
`includeStaleWeddingMedia`. The last one is used by save paths to sweep
recorded rows an editor replaced or abandoned before saving. A
draft-folder key is kept when no session is available to verify it,
because without the session the only draft that could reference it
cannot be found.

### Grace window

`STALE_WEDDING_MEDIA_GRACE_MS` (24 hours) protects uploads in flight.
`saveWeddingMedia` writes the `wedding_media` row as soon as a file
lands, while the editor persists the new URL on its next autosave. A
save that was already in flight carries the previous image, so sweeping
the new row immediately could delete the object the editor is about to
save. Swept rows younger than the window are kept; a later save cleans
them. Keys the caller names explicitly — a portrait replacement, a
gallery/music removal — skip the grace window, because the caller has
already declared them unwanted.

Only data-backed roles are swept: `bride`, `groom`, `couple`,
`gallery`, `music`. `wedding_media` rows for `video` are preserved
until the data model has a video field to reconcile against.

## Wiring

- `POST /api/uploads` accepts an optional `replaces` field. After the
  new object is stored, it offers the old key and any
  `replacedPaths` returned by `saveWeddingMedia` (for single-file roles
  with an existing wedding) to the cleanup service. The replaced key's
  role must match the upload role and must not equal the new path.
  `saveWeddingMedia` no longer deletes the superseded row before the
  object is gone: it returns the previous keys and removes only a
  same-key duplicate (the stable filename was overwritten in place).
  Cleanup deletes the object first and its row second, so a B2 failure
  leaves the row for a later sweep to retry.
- `POST /api/uploads/cleanup` is the client-facing removal endpoint
  used by `MediaFields` for gallery-item removal, soundtrack removal
  and replacing a library track. It returns
  `{ deleted, kept, failures }`.
- `POST /api/guest/draft` reads the previous draft before saving and
  passes the keys that disappeared from it, plus replaced keys from the
  live invitation's `previousData` when the session has already
  published, to the cleanup service. Cleanup runs after the save
  commits and never turns a successful save into an error.
- `PATCH /api/weddings/[id]` (account editor) cleans media referenced
  only by the previous `wedding_data` and sweeps stale rows for the
  wedding. It selects `guest_session_id` with the row so a linked
  builder draft is checked too.
- `syncActiveWeddingFromDraft` now returns `previousData`, the live
  data before the mirror, so the autosave route can identify replaced
  live media.
- `src/lib/services/media-packs.ts`: admin single-photo replacement
  deletes the old object(s) first and only then their rows. If B2
  refuses, the rows survive and a later replacement retries, rather
  than leaving an unreachable orphan behind.
- `MediaFields` sends `replaces` on portrait/music upload, calls the
  cleanup endpoint when an item is removed, and ignores a second pick
  for a slot whose upload is still running (two racing uploads would
  leave the first with no recorded superseder).

## Verification

- `src/lib/services/media-cleanup.test.ts` covers key normalization,
  folder authorization, live/expired drafts, draftId-only session
  discovery, stale-row sweep, the grace window, explicit removals,
  other-wedding rows, non-data-backed roles, query failures and storage
  failures.
- Route tests for guest draft and wedding PATCH assert the cleanup
  calls and payloads.
- Suite after this pass: `npm run typecheck` clean, `npm test` — 63
  files / 682 tests pass, `npm run build` passes, focused ESLint clean
  on the changed files. Repo-wide `npm run lint` still reports five
  pre-existing errors in untouched files (`favorites/page.tsx`,
  `admin/categories/page.tsx`, and the
  `PaymentConfirmationModal.tsx` effect rule).

## Remaining maintenance note

Existing orphans created before this change are not removed
retroactively. The earlier live audit found two stale groom objects in
B2 and duplicate guest drafts; the cleanup above handles them when the
owning wedding/draft is saved or deleted. A future maintenance-cron
sweep could enumerate guest-draft folders and aged `wedding_media` rows
without waiting for a save.

# 108. BUILDER UPLOAD NOTICE, TIMELINE ORDER AND GUEST EMAIL

Four publish-flow fixes shipped together.

## Oversized images

`src/components/builder/sections/MediaFields.tsx` checks every picked
portrait and gallery image against `MAX_MEDIA_BYTES` (15 MB, imported
from the client-safe `src/lib/library-media.ts`) before starting the
upload. Rejected files are collected by name and shown in a shared
`Modal` with the limit and an OK button. A `FILE_TOO_LARGE` response
from the server is folded into the same notice, so image-size failures
never appear in the form's inline error slot. That slot remains for
real upload/network failures and for the audio upload, whose limit is
unchanged.

## Save-the-dates order

`sample-template/index.html` now sorts the wedding plus additional
ceremonies by `date` + `time` in `fromRuntime` before rendering. The
number in each circle is still the array index, so the numbering now
matches the real timeline no matter what order the builder stored the
ceremonies in. Missing times sort to the start of their date; entries
without a usable ISO date keep their relative order after the dated
ones. The template package version is bumped to `1.3.0` because its
behavior changed.

## Guest publish email

`StepReview` marks the email field required for non-planner drafts and
blocks both checkout and the dev publish shortcut until a syntactically
valid address is present. The server is authoritative:
`POST /api/orders` trims and validates the address, then requires one
for a caller without a signed-in session. A signed-in owner may leave
the field empty because the route falls back to
`authSession.user.email`. Planner drafts still run the existing
session-owner check before anything else. Tests in
`src/app/api/orders/route.test.ts` cover a guest without an email, a
guest-supplied email and the signed-in account fallback.

## Verification

- `npm run typecheck` clean.
- `npm test` — 63 files / 686 tests pass.
- `npm run build` passes.
- Focused ESLint reports only the three pre-existing `<img>` warnings
  in `MediaFields.tsx`.

