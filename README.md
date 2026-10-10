# MACROPAGE CRM — API

Backend for **MACROPAGE CRM**, the internal CRM of MR Tech Solutions Pvt. Ltd.: **lead generation → confirmed deals → projects → finance**, plus a read-mostly **client portal**.

NestJS 11 · TypeScript (strict) · MongoDB 7 + Mongoose 8 · JWT (access + rotating refresh) · Swagger · Jest + mongodb-memory-server

---

## Quick start

Prerequisites: Node.js ≥ 20.11, Docker with Compose v2.

```bash
npm install
# create .env with the variables from the Environment section below, e.g.:
#   MONGODB_URI=mongodb://localhost:27017/macropage_crm?replicaSet=rs0&directConnection=true
#   JWT_ACCESS_SECRET=<openssl rand -base64 48>
#   JWT_REFRESH_SECRET=<openssl rand -base64 48>
docker compose up -d            # MongoDB 7, single-node replica set rs0 (auto-initiated)
npm run seed                    # wipes + loads demo data
npm run start:dev               # http://localhost:4000/api  ·  Swagger: http://localhost:4000/api/docs
```

> **Port 27017 already in use?** (e.g. a system `mongod`) Set `MONGO_PORT=27018` in `.env` and change `MONGODB_URI` to `mongodb://localhost:27018/macropage_crm?replicaSet=rs0&directConnection=true`.

Optional Mongo web UI: `docker compose --profile tools up -d`, then open http://localhost:8081 (admin / admin).

### Why a replica set?
`POST /leads/:id/convert` and `POST /expenses/batch` run in **multi-document transactions**, which MongoDB only supports on replica sets. The compose healthcheck runs `rs.initiate()` on first boot and reports healthy once a primary exists. MongoDB **Atlas** clusters are replica sets already, so just point `MONGODB_URI` at Atlas. No code changes are needed.

### Seeded credentials

| Role | Login | Password | Notes |
|---|---|---|---|
| ADMIN | `admin@macropage.in` | `admin123` | Full access |
| CUSTOMER | phone `9800020001` (or `client@demo.com`) | `client123` | Demo Retail Pvt. Ltd.: 2 projects (IN_PROGRESS, INITIATE) + 2 discussions (QUALIFIED; PROPOSAL with value shown) |
| CUSTOMER | phone `9800020002` (or `hotel@demo.com`) | `client123` | Seaside Hotels & Resorts: 1 project **awaiting approval** + 1 discussion (NEGOTIATION) |

The seed also creates 7 staff, 4 customers, 16 leads across every stage, 5 projects (INITIATE, IN_PROGRESS, TESTING, CLIENT_CONFIRMATION, CLOSED), 2 internal projects with their expenses, 4 company and 2 owner expenses (some without staff), and payments and expenses spread over the last 6 months. All data is fictional.

### Verify with Swagger
1. Open http://localhost:4000/api/docs.
2. **Auth → POST /auth/login** → *Try it out* → `{ "email": "admin@macropage.in", "password": "admin123", "role": "ADMIN" }` → *Execute*.
3. Copy `accessToken`, click **Authorize** (top right), paste it, then *Authorize*.
4. Try **GET /dashboard**, **GET /leads**, **GET /finance/summary**.
5. For the portal, log in as `hotel@demo.com` / `client123` with `"role": "CUSTOMER"`, re-authorize, then call **GET /portal/projects** and **POST /portal/projects/{id}/approve**.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run build` / `npm run start:prod` | Compile to `dist/` / run compiled build |
| `npm run seed` | Reset DB and load demo data (refuses in production unless `SEED_FORCE=true`) |
| `npm run migrate:phone-login` | Dry run of the phone-login data migration; add `-- --apply` to write (see below) |
| `npm run migrate:expense-scope` | Dry run of the expense `scope` backfill; add `-- --apply` to write (see below) |
| `npm test` | All tests (unit + integration on an in-memory replica set; MongoDB binary downloads on first run) |
| `npm run test:cov` | Tests with coverage |
| `npm run typecheck` / `npm run format` | `tsc --noEmit` / Prettier |

## Environment

| Variable | Default | Notes |
|---|---|---|
| `MONGODB_URI` | — (required) | Must be a replica set (local `rs0` or Atlas) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — (required, ≥ 16 chars) | Use different, long random values |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `900` / `604800` | Seconds (15 min / 7 days) |
| `PORT` | `4000` | |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated list |
| `NODE_ENV` | `development` | `production` hides invite temp passwords and disables Swagger |
| `THROTTLE_LIMIT` / `THROTTLE_TTL` | `10` / `60000` | Rate limit on login / refresh / change-password |
| `SWAGGER_ENABLED` | on unless production | Force Swagger on/off |
| `TRUST_PROXY` | `1` in production, else `0` | Reverse-proxy hops to trust for client IPs (rate limiting behind Render etc.) |
| `MONGO_PORT` | `27017` | docker compose only: host port for MongoDB |
| `PORTAL_URL` | `http://localhost:5173` | Client portal link in WhatsApp invites |
| `WHATSAPP_POLL_MS` | `5000` | How often the WhatsApp outbox is drained; `0` disables the worker |
| `WHATSAPP_MAX_ATTEMPTS` | `5` | Automatic send attempts per message (with backoff) before it stays `FAILED` |

The env is validated at boot; the app refuses to start on invalid config.

---

## Frontend screen → endpoint map

All routes are prefixed with `/api`. Every route is **ADMIN-only** unless marked otherwise.

| Screen | Endpoints |
|---|---|
| **Login** (Admin / Customer toggle) | `POST /auth/login` `{email,password,role:"ADMIN"}` or `{phone,password,role:"CUSTOMER"}` (public) · `POST /auth/refresh` (public) · `POST /auth/logout` · `GET /auth/me` (both roles) |
| **Change password** | `POST /auth/change-password` (both roles) |
| **Dashboard** | `GET /dashboard` |
| **Leads – Kanban board** | `GET /leads?stage=&ownerId=&source=&search=` (full list) · `GET /leads/stats` · `PATCH /leads/:id/stage` (drag & drop; not `WON`) |
| **Lead form / drawer** | `POST /leads` · `GET /leads/:id` (incl. `stageHistory`) · `PATCH /leads/:id` · `DELETE /leads/:id` · owner picker: `GET /staff?limit=500&isActive=true` |
| **Lead form – "Client portal access"** | `POST /leads` / `PATCH /leads/:id` with `{customerId \| null, newClient?, visibleToClient, showValueToClient, sendWhatsapp?}` (also `PATCH /leads/:id/client-access`) · client picker: `GET /customers?limit=500` (`contactName · phone`) |
| **WhatsApp audit** | `GET /whatsapp-messages?leadId=&customerId=&status=` · `POST /whatsapp-messages/:id/retry` |
| **Deal Won → Convert modal** | `POST /leads/:id/convert` · customer picker: `GET /customers?limit=500` · team picker: `GET /staff?limit=500` |
| **Projects board** | `GET /projects?stage=&status=running\|closed&search=` (full list) · `PATCH /projects/:id/stage` |
| **Project detail – overview** | `GET /projects/:id` (progress, `finance`, populated `team`, `engineerCount`/`staffCount`, `stageHistory`) · `PATCH /projects/:id` |
| **Project detail – progress** | `PATCH /projects/:id/progress` `{requirement?,ui?,frontend?,backend?}` |
| **Project detail – team** | `PUT /projects/:id/team` `{staffIds}` |
| **Project detail – client confirmation** | `POST /projects/:id/record-client-approval` (offline approval) |
| **Project detail – payments** | `GET /projects/:id/payments` · `POST /payments` · `PATCH /payments/:id` · `DELETE /payments/:id` |
| **Project detail – expenses** | `GET /projects/:id/expenses` · `POST /expenses/batch` · `PATCH /expenses/:id` · `DELETE /expenses/:id` |
| **Internal projects** | `GET /internal-projects?status=&search=&page=&limit=` · `POST /internal-projects` · `GET/PATCH/DELETE /internal-projects/:id` · `GET /internal-projects/:id/expenses` · costs: `POST /expenses/batch` with `internalProjectId` |
| **Payments ledger** | `GET /payments?projectId=&from=&to=&page=&limit=` |
| **Expenses ledger** | `GET /expenses?scope=&projectId=&internalProjectId=&category=&staffId=&from=&to=&page=&limit=` |
| **Finance** | `GET /finance/summary` · `GET /finance/projects` · `GET /finance/monthly?months=6` · `GET /finance/expenses/by-category` · `GET /finance/expenses/by-user?projectId=&from=&to=` |
| **Staff** | `GET/POST /staff` · `GET/PATCH/DELETE /staff/:id` |
| **Customers** | `GET/POST /customers` · `GET/PATCH/DELETE /customers/:id` |
| **Customer logins** | `GET/POST /users` · `GET/PATCH /users/:id` · `POST /users/:id/reset-password` |
| **Client portal – nav count pills** (CUSTOMER) | `GET /portal/summary` → `{ projects, activeDiscussions }` |
| **Client portal – My projects** (CUSTOMER) | `GET /portal/projects` |
| **Client portal – My Discussions** (CUSTOMER) | `GET /portal/discussions` |
| **Client portal – Discussion detail** (CUSTOMER) | `GET /portal/discussions/:id` |
| **Client portal – Project** (CUSTOMER) | `GET /portal/projects/:id` · `POST /portal/projects/:id/approve` · `POST /portal/projects/:id/request-changes` `{note}` |
| Health check | `GET /health` (public) |

### Response conventions
- `id` strings (never `_id`/`__v`); money is a number with ≤ 2 decimals; timestamps are ISO-8601; date-only fields (`startDate`, `endDate`, `expectedClose`, payment `date`, expense `date`) are `YYYY-MM-DD`.
- Frontend aliases: lead `owner` = owner staff id; expense `userId` = staff id, `date` = `spentOn`; payment `date` = `paidOn`. The same aliases are **accepted on input** (`owner`, `userId`, `date`) alongside the canonical names (`ownerId`, `staffId`, `spentOn`, `paidOn`).
- Paginated lists (`/customers`, `/staff`, `/users`, `/payments`, `/expenses`): `?page=1&limit=20&search=` → `{ data, meta: { page, limit, total } }` (`limit` ≤ 500). Lead and project boards return full arrays.
- Errors: `{ statusCode, message, error }`. Validation → 400 (message array), invalid `:id` → 400, Mongo duplicate key → 409, Mongoose cast/validation → 400.

---

## Business rules

**Leads**
- New leads start at `LEAD` (or any given non-`WON` stage). Stages move freely between `LEAD … PENDING` and `CANCELLED`; each change appends `{from,to,by,at}` to `stageHistory` and updates `stageUpdatedAt`.
- `WON` is reachable **only** via `POST /leads/:id/convert`.
- `quote` (`{ "PRO": number, "PREMIUM": number }`, both > 0, or `null` if never set) is set via `POST /leads` or `PATCH /leads/:id`. Once set, it cannot be cleared. A lead can't enter `PROPOSAL` without a quote (400). The quote is never shown in the customer portal.
- Converted leads (`projectId` set) are locked: no stage change (409), no delete (409), and `value` follows the project's contract value.
- `GET /leads/stats` → `winRate = round(won / total × 100)`.

**Deal Won → Project** (single transaction: `connection.startSession()` + `session.withTransaction`)
1. Validates `plan` (`PRO` | `PREMIUM`, required), `contractValue > 0`, `endDate ≥ startDate`, lead not converted or cancelled, and that every staff id exists.
2. `customerId: "NEW"` creates a Customer from the lead's company/contact. If the lead has an email and no user owns it, a CUSTOMER login is created with a random temporary password. The invite e-mail is a logged stub (`UsersService.sendInvite`); the response's `invite.temporaryPassword` is included only when `NODE_ENV !== 'production'`.
3. Creates the Project at `INITIATE` (`dev` all 0, `team = staffIds`, `plan`). `contractValue` is the final price as sent, and is never recomputed from the quote. Projects from before plans existed have `plan: null`. `PATCH /projects/:id` can change it later.
   It then marks the lead `WON` (`wonAt`, `projectId`, `customerId`, `value = contractValue`), writing a history entry on both.
4. Any failure rolls back everything (covered by tests). Invite and log side effects happen only after commit.

**My Discussions (client portal)**
- A lead shows up for a customer only when an admin has linked it (`customerId`) **and** set `visibleToClient`. Setting `visibleToClient` without a customer → 400; clearing `customerId` resets both flags; a converted lead cannot be moved to another customer (409).
- Eligibility (list and detail): `{ customerId: me, visibleToClient: true, projectId: null, stage ≠ WON }`. After conversion the lead drops out and the project appears under My Projects. Anything not eligible (another customer's, hidden, converted) is a plain **404**.
- Response is whitelisted (`src/portal/discussion.mapper.ts`): `id, title, stage, status (ACTIVE | CLOSED), stageProgress, lastUpdatedAt, timeline [{stage, at}]`, plus `value` only when `showValueToClient`. Notes, source, owner, contact details, expected close, ids and history authors are never returned.
- `stageProgress = index in [LEAD … PENDING] / 8 × 100` (LEAD 0, PENDING 100). `CANCELLED` → `status: CLOSED`, keeps the last stage's progress, and is listed after active discussions (each group newest first).

**Projects**
- Admin may set any stage, except `CLOSED`, which requires `clientApproved === true` (otherwise 409). Moving into `CLIENT_CONFIRMATION` starts a new approval round (`clientApproved = false`); leaving `CLOSED` clears `closedAt`.
- Client confirmation (stage must be `CLIENT_CONFIRMATION`, else 409; another customer's project → 404):
  `approve` → `clientApproved = true`, `CLOSED`, `closedAt = now` · `request-changes {note}` → `clientApproved = false`, `clientNote`, `CONFIRMATION_TESTING`. These are atomic conditional updates, so a double click cannot approve twice.
- `progress`: fixed per stage (INITIATE 5, STARTED 12, TESTING 65, CLOUD_SETUP 72, SERVER_SETUP 79, CONFIRMATION_TESTING 86, DEPLOYMENT 92, CLIENT_CONFIRMATION 97, CLOSED 100); `IN_PROGRESS = round(12 + avg(requirement, ui, frontend, backend) × 0.53)`. Track updates are clamped to 0–100.

**Finance** (computed by aggregation, never stored; soft-deleted rows excluded)
```
received = Σ payments   pending = max(contract − received, 0)   spent = Σ expenses
net = received − spent   projected = contract − spent   margin = contract ? round((contract − spent) / contract × 100) : 0
```
`/finance/summary.pending` is the sum of per-project pending (an overpaid project does not offset another's balance).

**Dashboard**: leads = all leads; confirmedLeads = `WON`; projectsRunning = stage ≠ `CLOSED`; projectsOngoing = stage ∉ {`INITIATE`, `CLOSED`}; projectsClosed = `CLOSED`; awaitingClient = `CLIENT_CONFIRMATION`; revenue = Σ payments; booked = Σ contract values; net = revenue − expenses.

**Work status** (admin only, never under `/portal`)
- `POST /projects/:projectId/work-logs` takes `{ staffId, status?, note?, items: [{ scope, type }] }`. It creates one `WorkLog` per item in a single transaction, and all rows share the same staff member, status (default `IN_PROGRESS`) and note.
- A `PROJECT` item is stored with the project's id; a `LEAD` item is stored with the project's `leadId`.
- `staffId` must be on the project's team. Each `type` must be in `WORK_TYPES[scope]` (`src/common/constants/enums.ts`). A request can't repeat the same scope + type, but the same work can be logged again later.
- `GET /projects/:projectId/work-logs` returns the project's PROJECT logs plus its lead's LEAD logs. `GET /work-logs?staffId=&status=&projectId=&leadId=` returns all logs, filtered. Both are sorted newest `updatedAt` first, and each row includes `targetName` (the project name or lead title).
- `PATCH /work-logs/:id` takes `{ type?, note?, status? }`, and the type must stay within the row's scope. `DELETE /work-logs/:id` soft-deletes the log.
- `GET /staff` and `GET /staff/:id` add `currentWork`: every log that isn't `DONE`, newest first.
- Deleting a staff member or a lead also soft-deletes their logs.

**Client accounts & WhatsApp**
- Phones are stored normalised: digits with country code, no `+` (`"98765 43210"`, `"+91 98765 43210"` and `"098765-43210"` all become `"919876543210"`; 10-digit numbers get `91`). `Customer.phone` is unique among live customers and may be null. Login, dedupe and the customer API all use the same `normalizePhone`.
- CUSTOMER login: `{ phone, password, role: "CUSTOMER" }`. The phone finds the customer, and the password picks its CUSTOMER login. Email login still works for customer accounts that have an email. ADMIN logins use email only. Customer logins may have no email.
- Lead access body on `POST /leads` / `PATCH /leads/:id` (one transaction; omitted fields are left unchanged):
  - `customerId` links an existing customer. `newClient: { name, phone, email? }` reuses the live customer with that phone, or creates one (company = the lead's company), and gives it a portal login if it has none. Sending both → 400.
  - `customerId: null` without `newClient` unlinks the lead and turns both flags off. `visibleToClient` without a client is forced off.
  - `showValueToClient: true` requires `visibleToClient` (400); hiding the lead hides the value too.
  - The response is the lead, plus `invite: { phone, email, temporaryPassword }` when a login was created (the password is left out in production).
- Converting: a lead already linked to a client converts for that client. `customerId` may be omitted; a different one → 409. `"NEW"` reuses the customer that already has the lead's phone.
- `sendWhatsapp: true` requires a linked client with a phone (400 otherwise). After commit, it writes one `whatsapp_messages` row (the outbox and audit trail) and returns `whatsapp: { id, status }`. A worker sends due rows through `WhatsappProvider` (currently a logging stub; bind a real one in `WhatsappModule`). A provider error marks the row `FAILED` and retries it with backoff. Queueing or sending problems never fail the lead save. A new login's temporary password is part of the message and is erased once the row is `SENT` or out of attempts; the API never returns it.

**Deploying the phone-login change:** run `npm run migrate:phone-login` (dry run) and check its report, then `npm run migrate:phone-login -- --apply`. The migration:
- normalises existing customer phones, and sets `''`, missing or unparseable phones to null;
- when live customers share a number, keeps it on the oldest one and clears the others (listed in the report, to fix by hand);
- backs up every changed value to `migration_2026_10_customer_phones`;
- replaces the old unique `users.email_1` index (it forbids more than one user without an email) and adds the phone index.

Until it runs, creating a second email-less customer login fails with 409. Customers without a phone can't sign in by phone until an admin sets one.

**Expenses** are recorded in batches: one target + an optional staff member + one date, with several category lines. Each line becomes its own `Expense` document (`insertMany` in a transaction). Each expense has a `scope`:

| scope | projectId | internalProjectId | staffId |
|---|---|---|---|
| `PROJECT` (client project) | required | empty | required |
| `INTERNAL_PROJECT` | empty | required | required |
| `COMPANY` (office, tools, salaries…) | empty | empty | optional |
| `OWNER` (the owner's own expenses) | empty | empty | optional |

- `POST /expenses/batch` checks the table for the whole batch, and returns 400 with a message naming the field. The model enforces the same rules.
- A batch without `scope` is inferred from its id: `internalProjectId` → `INTERNAL_PROJECT`, `projectId` → `PROJECT`. With neither, it's a 400.
- Every expense in a response has `scope`, `projectId`, `internalProjectId` and `staffId` (alias `userId`), with `null` where a field doesn't apply.
- `PATCH /expenses/:id` with `staffId: null` clears the staff member on `COMPANY` / `OWNER` expenses (400 otherwise).
- Filters: `GET /expenses?scope=` combines with `projectId`, `internalProjectId`, `category` and `staffId`. `/finance/expenses/by-category` and `/finance/expenses/by-user` accept `?scope=` too.
- `by-user` groups expenses without a staff member under one entry, `{ userId: null, name: "Unassigned" }`, so its totals still add up to all expenses.
- Every scope counts as a business expense: in `/finance/summary` (`expenses` and `net`, broken down by `internalExpenses`, `companyExpenses` and `ownerExpenses`), `/finance/monthly`, by-category, by-user, and the dashboard `money`.
- Only `PROJECT` expenses reach `/finance/projects`, a client project's `finance` block and `projected`. Nothing about expenses is ever exposed under `/portal`.

**Deploying the expense-scope change:** run `npm run migrate:expense-scope` (dry run), then add `-- --apply`. It sets `scope` on older rows (`INTERNAL_PROJECT` if they have an `internalProjectId`, otherwise `PROJECT`) and creates the `{scope, spentOn}` index. The API already reads older rows correctly before the migration runs (their scope is worked out from the ids), so this only makes the data explicit.

**Internal projects** are projects for our own business, with no client, lead, contract or payments.
- Fields: `name` (required), `description`, `status` (`PLANNED` | `ACTIVE` (default) | `ON_HOLD` | `COMPLETED`), `budget` (≥ 0, nullable), `startDate` ≤ `endDate` (both optional, `YYYY-MM-DD`).
- Responses add `spent`, the sum of the project's expenses.
- Deleting one soft-deletes it together with its expenses, in one transaction.
- Their costs are ordinary expenses, so they count in `/finance/summary` (`expenses`, `net`, plus an `internalExpenses` breakdown), `/finance/monthly`, `/finance/expenses/by-category`, `/finance/expenses/by-user`, and the dashboard `money.expenses` / `money.net`.
- They are kept out of `/finance/projects`, a client project's `finance` block, `projected` (contract − client-project spend), and everything under `/portal`.
- No data migration is needed: existing expenses keep their `projectId`, and a missing `internalProjectId` counts as null.

---

## Security
- Global `JwtAuthGuard` + `RolesGuard`. Routes without `@Roles` are **ADMIN-only by default**, so CUSTOMER tokens reach only `/auth/*` and `/portal/*`. `@Public()` opts out (login, refresh, health).
- The user is re-loaded on each request, so deactivated or deleted accounts lose access immediately.
- Passwords: bcrypt. Refresh tokens: rotated on every refresh and stored as a SHA-256 digest (bcrypt would only compare the first 72 bytes, which all of a user's JWTs share). Replaying a rotated-out refresh token revokes the session.
- `passwordHash` / `refreshTokenHash` are `select: false`, stripped by `toJSON`, and never mapped into responses (tested).
- Helmet (relaxed CSP only on `/api/docs`), CORS allow-list, throttling on login/refresh/change-password, `whitelist` validation, escaped regex search.
- Portal responses are separate projections: no expenses, margins, staff costs, lead data, or staff contact details. Another customer's project returns 404 so its existence is not leaked.

## Data model notes
- **Soft delete** (`src/common/plugins/soft-delete.plugin.ts`): adds `deletedAt`; filters `find`, `findOne`, `findOneAndUpdate`, `countDocuments`, `updateOne`, `updateMany` and prepends a `$match` to `aggregate()` unless `{ withDeleted: true }` is set; adds `softDelete(id)` / `restore(id)` statics. `$lookup` sub-pipelines filter `deletedAt: null` explicitly.
- Indexes: Lead `{stage,createdAt}`, `{ownerId,createdAt}`, `{createdAt}`, `{customerId,visibleToClient,stage}`, `{projectId}` unique sparse, text `{title,company,contactName}`; Project `{stage}`, `{customerId,stage}`, `leadId` unique, text `{name}`; Payment `{projectId,paidOn}`, `{paidOn}`; Expense `{projectId,spentOn}`, `{internalProjectId,spentOn}` (partial), `{scope,spentOn}`, `{category,spentOn}`, `{staffId,spentOn}`, `{spentOn}`; User `email` unique when set (partial); Customer `phone` unique among live customers (partial); WhatsappMessage `{status,nextAttemptAt}`, `{leadId,createdAt}`, `{customerId,createdAt}`. Board search uses an escaped case-insensitive regex (partial-word "contains" matching, which `$text` cannot do); the text indexes are in place for full-text search.
- Soft-deleted users keep their unique email; reusing it returns 409.

## Project layout
```
src/
  main.ts · app.module.ts · app.setup.ts (shared with e2e) · health.controller.ts · seed.ts
  config/            env validation (class-validator)
  common/            constants (enums) · decorators (@Public, @Roles, @CurrentUser) · guards · filters ·
                     interceptors · pipes (ParseObjectIdPipe) · plugins (softDelete, toJSON) · schemas · dto · utils
  auth/ users/ customers/ staff/ leads/ projects/ payments/ expenses/ finance/ dashboard/ portal/ work-logs/ whatsapp/ internal-projects/
                     each: schemas/ · dto/ · *.controller.ts · *.service.ts · *.module.ts · *.mapper.ts
  migrations/        one-off data migrations (dry run by default)
test/                e2e suites (leads/convert, finance, portal, discussions, auth, work logs, client accounts & WhatsApp, phone migration, internal projects, expense scopes) + in-memory replica-set setup
```

## Tests
`npm test` runs 142 tests against a real MongoDB in-memory **replica set** (so transactions are exercised):
- `project-progress.spec.ts`: progress formula for every stage
- `finance.util.spec.ts`: finance formulas
- `soft-delete.plugin.spec.ts`: query and aggregate filtering, `withDeleted`, `softDelete`/`restore`, `toJSON`
- `test/leads.e2e-spec.ts`: stage rules, conversion, **rollback** (natural duplicate-key failure and an injected failure)
- `test/finance.e2e-spec.ts`: `$group`/`$lookup` aggregations, monthly buckets, per-user/category splits, batch expenses
- `test/portal.e2e-spec.ts`: **customer data isolation**, approval/request-changes, close rule, dashboard counts
- `test/discussions.e2e-spec.ts`: My Discussions visibility rules, 404 isolation, field whitelist, CLOSED ordering, conversion hand-off, client-access validation
- `test/auth.e2e-spec.ts`: login role check, refresh rotation and reuse detection, no secret leakage, user admin

## Versions
NestJS **11.2** is used rather than 12: Nest 12 is ESM-only and was weeks old at the time of writing, and ts-jest does not support TypeScript 7 yet. Nest 11 still receives patch releases. Mongoose **8** is used because Mongoose 9 changed the middleware API used by the soft-delete plugin. `@nestjs/swagger`'s `js-yaml` is pinned to a patched release via `overrides`.
