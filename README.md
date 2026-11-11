# LendLoop

A neighbourhood tool-lending board. Neighbours list tools they rarely use, others request them for a date range, owners approve, and n8n handles the notifications and overdue reminders.

**Stack:** Next.js 16 (App Router) · TypeScript · Clerk · Convex · n8n · Tailwind CSS 4 · Vitest

- [Features](#features)
- [Architecture](#architecture)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [n8n workflows](#n8n-workflows)
- [Security and data minimisation](#security-and-data-minimisation)
- [Testing](#testing)
- [What I'd change for production](#what-id-change-for-production)

## Features

**Public page (`/`).** The name, a tagline, a live read-only list of tools from Convex (name and category only), and a Clerk **"Sign in to lend or borrow"** button.

**Signed-in users (`/app`).**

| View | What you can do |
| --- | --- |
| **Browse** | See every tool with live availability ("Available" or "On loan until …", plus upcoming bookings). Filter by category. Request a date range with an optional note. |
| **My listings** | List a tool (name, category, condition, short description). Edit or delete your own listings. |
| **My requests** | Track your borrowing, cancel a pending request, mark a loan returned. |
| **Incoming requests** | Approve or decline requests for your tools, and mark loans returned. |
| **Loan details** | Status, parties and the **recent automation activity** for that loan (webhook deliveries, retries, reminders, workflow errors). |
| **Admin** (admins only) | Remove any listing, view all loans, mark a lender as **Trusted Lender** (shown as a badge across the app). |

Business rules are enforced in Convex: no borrowing your own tool, valid date ranges (no past starts, max 30 days), no overlapping approved loans, one pending request per tool per borrower, and a strict loan state machine (`pending → approved | declined | cancelled`, `approved → returned`).

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js App Router<br/>client components]
  end
  Clerk[(Clerk)]
  subgraph Convex
    Q[queries / mutations<br/>RBAC in every function]
    DB[(users · tools · loans<br/>automationEvents · webhookNonces)]
    A[internal action<br/>notifyRequestCreated]
    H[HTTP actions<br/>/n8n/*]
  end
  subgraph n8n
    W1[Request notification]
    W2[Daily overdue reminder]
    W3[Error handler]
  end
  SMTP[(SMTP)]

  UI -- sign in --> Clerk
  Clerk -- JWT (template "convex") --> UI
  UI -- useQuery / useMutation + JWT --> Q
  Q <--> DB
  Q -- scheduler.runAfter(0) --> A
  A -- "HMAC-signed POST (retries + backoff)" --> W1
  W1 --> SMTP
  W2 -- "signed POST /n8n/overdue-loans" --> H
  W2 --> SMTP
  W2 -- "signed POST /n8n/reminder-status<br/>(idempotency key)" --> H
  W3 -- "signed POST /n8n/workflow-error" --> H
  H <--> DB
```

```
app/                    Next.js routes. "/" is public, "/app/*" needs a Clerk session (proxy.ts)
components/             UI (Tailwind) and the Convex + Clerk provider
convex/
  schema.ts             tables and indexes
  users.ts              user sync from Clerk, admin bootstrap, Trusted Lender
  tools.ts              public list, browse with availability, CRUD
  loans.ts              request / approve / decline / cancel / return, views
  automation.ts         outbound webhook with retries, nonce store, idempotent write-backs
  http.ts               signed HTTP endpoints for n8n
  crons.ts              prunes expired nonces
  seed.ts               demo data (internal)
  lib/hmac.ts           signing and verification (Web Crypto)
  lib/rbac.ts           authorization rules and loan state machine
  lib/dates.ts          date-range validation
n8n/                    exported workflows + n8n/.env.example
tests/                  Vitest unit tests
docker-compose.yml      self-hosted n8n with automatic workflow import
```

### Request lifecycle

1. A borrower calls `loans.request`. Convex validates the dates, checks conflicts, inserts a `pending` loan and schedules `automation.notifyRequestCreated` (it runs only if the mutation commits).
2. The action builds a minimal payload, signs it, and POSTs it to the n8n webhook with a 10 s timeout. A 2xx is logged as `success`. A network error, 408, 429 or 5xx is retried after 10 s, 1 min and 5 min. Any other 4xx is logged as `failed` without retrying. Every attempt is recorded in `automationEvents`.
3. n8n verifies the signature, timestamp and nonce, drops duplicate `eventId`s, emails the lender (node retries ×3) and acknowledges.
4. The lender approves or declines in **Incoming requests**.

## Local setup

Prerequisites: Node 20+, npm, Docker (for n8n), plus free [Clerk](https://clerk.com) and [Convex](https://convex.dev) accounts.

```bash
git clone https://github.com/tanakongsengwan/lendloop.git
cd lendloop
npm install
cp .env.example .env.local
```

### 1. Clerk

1. Create a Clerk application and copy **Publishable key** and **Secret key** into `.env.local`.
2. In **Configure → JWT templates**, create a template from the **Convex** preset. Keep the name `convex`. Copy its **Issuer** URL.

### 2. Convex

```bash
npx convex dev            # log in, create a project; writes CONVEX_DEPLOYMENT + NEXT_PUBLIC_CONVEX_URL
```

In a second terminal, set the backend env vars:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
npx convex env set ADMIN_EMAILS you@example.com
npx convex env set APP_URL http://localhost:3000
npx convex env set CONVEX_TO_N8N_SECRET "$(openssl rand -hex 32)"
npx convex env set N8N_TO_CONVEX_SECRET "$(openssl rand -hex 32)"
npx convex env set N8N_REQUEST_WEBHOOK_URL https://<public-n8n-host>/webhook/lendloop/request-created
npx convex run seed:demo  # optional: demo tools and one overdue loan
```

> No account yet? `CONVEX_AGENT_MODE=anonymous npx convex dev` runs a local backend at `http://127.0.0.1:3210` (HTTP actions on `:3211`).

### 3. Next.js

```bash
npm run dev               # http://localhost:3000
```

Sign in with an email on `ADMIN_EMAILS` to get the Admin tab. The email must be verified in Clerk.

### 4. n8n (docker-compose)

```bash
cp n8n/.env.example n8n/.env      # use the same two secrets you set in Convex
docker compose up -d              # imports the 3 workflows on first start, then runs n8n
open http://localhost:5678
```

Then in the n8n UI:

1. Create an **SMTP** credential (Mailpit, Mailtrap or any SMTP server) and select it on the two **Email** nodes.
2. Check that each workflow's **Settings → Error workflow** is *LendLoop – Error handler* (set by the import).
3. Activate **Request notification** and **Daily overdue reminder**.

Convex calls n8n from the cloud, so the webhook must be reachable from the internet. Expose it with `cloudflared tunnel --url http://localhost:5678` or `ngrok http 5678`, set `N8N_PUBLIC_URL` to that URL, and set Convex `N8N_REQUEST_WEBHOOK_URL` to `<that URL>/webhook/lendloop/request-created`. With a local Convex backend, `http://localhost:5678/...` works directly, and `CONVEX_SITE_URL=http://host.docker.internal:3211` lets n8n reach Convex. n8n Cloud works as well: import the JSON files and set the same variables.

## Environment variables

| Where | Name | Purpose |
| --- | --- | --- |
| `.env.local` | `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT` | Written by `npx convex dev` |
| `.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk keys |
| Convex | `CLERK_JWT_ISSUER_DOMAIN` | Issuer of the Clerk `convex` JWT template (`convex/auth.config.ts`) |
| Convex | `ADMIN_EMAILS` | Comma-separated admin allowlist (verified emails only) |
| Convex | `APP_URL` | Base URL used in notification links |
| Convex | `N8N_REQUEST_WEBHOOK_URL` | n8n webhook for new requests |
| Convex + n8n | `CONVEX_TO_N8N_SECRET` | HMAC secret, Convex → n8n |
| Convex + n8n | `N8N_TO_CONVEX_SECRET` | HMAC secret, n8n → Convex (different from the above) |
| n8n | `CONVEX_SITE_URL` | Convex HTTP actions URL (`https://<deployment>.convex.site`) |
| n8n | `LENDLOOP_FROM_EMAIL` | Sender address |
| n8n | `N8N_ENCRYPTION_KEY` | Encrypts n8n credentials at rest |

No secret is committed. `.env*` files are git-ignored except the `.env.example` templates.

## n8n workflows

All three are in [`/n8n`](n8n) and are imported automatically by docker-compose.

| Workflow | Trigger | What it does |
| --- | --- | --- |
| **Request notification** (`request-notification.json`) | Webhook `POST /webhook/lendloop/request-created` (raw body) | Verifies the HMAC, timestamp and nonce. Returns **401** if any check fails, or **200 duplicate** if this `eventId` was already handled. Otherwise emails the lender (3 tries), then records the `eventId` as processed. |
| **Daily overdue reminder** (`overdue-reminder.json`) | Schedule, 09:00 Asia/Bangkok | Signed `POST /n8n/overdue-loans`, then emails each borrower. The email node's error output still reports the result. A signed `POST /n8n/reminder-status` writes back `sent` or `failed` with the loan's idempotency key. |
| **Error handler** (`error-handler.json`) | Error Trigger | Set as the error workflow of the two above. Reports the failed execution to Convex via signed `POST /n8n/workflow-error`, keyed by execution id. |

### Signing protocol (both directions)

```
X-LendLoop-Timestamp: <unix seconds>
X-LendLoop-Nonce:     <128-bit random hex, single use>
X-LendLoop-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<nonce>.<raw body>")>
```

The receiver recomputes the HMAC over the **raw** body and compares it in constant time. It rejects timestamps more than ±5 minutes off, and rejects any nonce it has already seen in that window. Convex stores nonces in `webhookNonces` (inside a mutation, so concurrent replays are serialised; an hourly cron prunes them). n8n keeps them in workflow static data. Each direction has its own secret. Signing is implemented once in `convex/lib/hmac.ts` and mirrored in the Code nodes. A unit test checks it against Node's `crypto.createHmac`, which is what the Code nodes use.

### Reliability and idempotency

- **Outbound retries.** Convex retries with backoff (10 s → 1 min → 5 min). Each attempt is visible on the loan page. The `eventId` / `Idempotency-Key` stays the same across retries, so n8n never emails twice for the same request.
- **Inbound retries.** The n8n Code nodes re-sign on every attempt, because a reused nonce would rightly be rejected. They retry network errors, 408, 429 and 5xx with exponential backoff. Node-level "Retry on fail" adds a second layer.
- **Idempotent write-backs.** Convex issues `overdue-reminder:<loanId>:<YYYY-MM-DD>` as the key. `recordReminderResult` returns the original result for a key it has already seen (200, `duplicate: true`) and writes nothing. A successful reminder also sets `lastReminderDate`, so running the workflow twice in one day does not email anyone twice.
- **Error workflow.** Any failed execution appears as a `workflow_error` automation event.

## Security and data minimisation

- **Authorization lives in Convex.** Every query and mutation resolves the caller from `ctx.auth.getUserIdentity()` (the Clerk JWT validated by Convex) to a `users` row with a `role`, then checks the rules in `convex/lib/rbac.ts`. Hiding a button in the UI is never the only protection. `proxy.ts` only gives signed-out visitors a better experience.
  - Users edit or delete only their own listings, approve or decline only requests for their own tools, cancel only their own requests, and mark returned only loans they are part of.
  - Admins can remove any listing, read all loans and users, and set Trusted Lender. They cannot approve or decline on someone else's behalf.
- **Admin bootstrap.** The admin role comes only from the `ADMIN_EMAILS` env allowlist, and only for a **verified** email claim. There is no client-callable "make me admin".
- **Public data minimisation.** `tools.listPublic` returns `{ name, category }` and nothing else: no ids, owners, descriptions or availability.
- **Minimal payloads.** Signed-in users see other people's display names only, never their emails. The request webhook carries the lender's email (needed to notify them) and only the borrower's display name. The overdue endpoint returns only the borrower's name and email, the tool, the due date and the idempotency key.
- **Webhook hardening.** HMAC both ways with separate secrets, timestamp window, single-use nonces, constant-time compare, 64 KB body cap, strict input validation (`normalizeId` for ids), and a generic 401 so callers can't tell which check failed. The detailed reason is only logged server-side.
- **Secrets** live only in env vars (Convex, `.env.local`, `n8n/.env`) or n8n credentials. Workflow JSON references them as `$env.*`.
- **User-facing errors** are thrown as `ConvexError`, so clients get a clear message and internal errors stay redacted.

## Testing

```bash
npm test          # Vitest: HMAC signing/verification, RBAC + state machine, admin bootstrap, date rules
npm run typecheck # Next.js app + Convex functions
npm run lint
npm run build
```

## What I'd change for production

- **Delivery:** move the outbound webhook to a durable outbox, such as the Convex Workpool / Action Retrier components, with a dead-letter view for admins. Retries currently live in the scheduler.
- **n8n state:** keep n8n's nonce and processed-event store in Redis or Postgres instead of workflow static data, run n8n on Postgres in queue mode, and use secret rotation with key ids (`v1=`/`kid`) so secrets can roll without downtime.
- **Auth:** sync users with a Clerk webhook (`user.created/updated/deleted`) instead of client-triggered `users.store`, manage roles in Clerk metadata or an admin UI, and add an audit log for admin actions.
- **Data:** paginate the lists (`usePaginatedQuery`), add search, and enforce date conflicts with per-day booking rows if traffic grows. Add a retention policy for `automationEvents`.
- **Product:** in-app notifications, lender ratings, photos (Convex file storage with type and size checks), time zones per neighbourhood.
- **Ops:** CI running lint, typecheck, tests and `convex deploy --dry-run`; Playwright end-to-end tests with Clerk testing tokens; error monitoring (Sentry) and alerting on `failed` automation events; rate limiting on mutations.
